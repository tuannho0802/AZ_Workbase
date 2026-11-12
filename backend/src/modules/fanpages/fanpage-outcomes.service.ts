import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { Deposit } from '../../database/entities/deposit.entity';
import { FanpagePost } from '../../database/entities/fanpage-post.entity';
import { FanpageUtm } from '../../database/entities/fanpage-utm.entity';
import { todayVnStr } from '../../common/utils/date-vn.util';
import { CustomerAccessHelper } from '../customers/helpers/customer-access.helper';
import { UiVisibilityService } from '../ui-visibility/ui-visibility.service';
import { UtmCustomersService } from '../utms/utm-customers.service';
import { UtmsService } from '../utms/utms.service';
import { OutcomeCustomersQueryDto, OutcomesQueryDto } from './dto/fanpage-utm.dto';
import { FanpageAccessService, FanpageCaller } from './fanpage-access.service';
import { FANPAGE_BATCH_SIZE } from './fanpage-insights.service';
import { FanpageScopedQuery } from './fanpage-scoped-query';
import { FanpageUtmChip, FanpageUtmsService, RESTRICTED_UTM_LABEL } from './fanpage-utms.service';
import { resolveStatsRange } from './helpers/fanpage-metrics.helper';
import { buildPageOutcomes, closeRate, customersPerPost, OutcomeBucket, UtmAgg, UtmLinkRow } from './helpers/fanpage-utm.helper';

const chunk = <T>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
};

type BucketView = Omit<OutcomeBucket, 'deposit'> & { deposit?: number };

export interface OutcomeUtmRow {
    utmId: number;
    name: string;
    locked: boolean;
    isPrimary: boolean;
    primaryFanpage: { id: number; name: string } | null;
    customers: number;
    deposit?: number;
}

export interface PageOutcomeRow {
    fanpageId: number;
    name: string;
    archived: boolean;
    posts: number;
    /** Khách ghi công / số bài trong kỳ (R3: Page tham gia không tính); null khi Page không có bài. */
    customersPerPost: number | null;
    /** Chỉ số GHI CÔNG (UTM mà Page là chính). */
    primary: BucketView;
    /** Chỉ số THAM GIA - dùng chung, KHÔNG cộng vào tổng (R3). */
    participating: BucketView;
    utms: OutcomeUtmRow[];
}

export interface OutcomesResponse {
    from: string;
    to: string;
    /** Scope `fanpage_stats.view` (Page nào được thấy). */
    statsScope: string;
    /** Scope `customers.view` áp lên khách (R6); null = không xem được khách nào -> mọi số = 0. */
    customerScope: string | null;
    /** true = có trường tiền ở ÍT NHẤT một dòng (qua cổng 4 lớp). FE chỉ hiện cột Tiền khi true. */
    hasRevenue: boolean;
    pages: PageOutcomeRow[];
    /** Đếm DISTINCT độc lập, bằng Σ cột "chính" của các Page (bất biến R4). */
    total: { customers: number; closed: number; closeRate: number | null; deposit?: number };
    /** R5 - chỉ scope rộng (all/department) mới có; null = không hiển thị. */
    unassigned: { customers: number; closed: number } | null;
}

/**
 * D1/D3 - quy kết khách & tiền nạp theo Page (PLAN 3.7). Hợp đồng số liệu:
 *  - Mỗi khách có đúng 1 `utm_id`, mỗi UTM tối đa 1 Page chính => Σ chính == Tổng. "Tổng" đếm bằng truy vấn DISTINCT RIÊNG.
 *  - Phạm vi khách = `customers.view` của người gọi (R6), bỏ khách xoá mềm.
 *  - Tiền nạp: cổng 4 lớp - thiếu lớp nào thì BỎ HẲN trường tiền (không trả null/0): (1) `fanpage_revenue.view` phủ tới Page,
 *    (2) khách trong phạm vi `customers.view` + inner join khách chưa xoá, (3) không bị ẩn UI `tab:deposits`, (4) chỉ Tổng nạp.
 *  - Tổng chỉ gồm UTM có Page chính TRONG phạm vi xem.
 */
@Injectable()
export class FanpageOutcomesService {
    constructor(
        @InjectRepository(Customer)
        private readonly customerRepo: Repository<Customer>,
        @InjectRepository(Deposit)
        private readonly depositRepo: Repository<Deposit>,
        @InjectRepository(FanpagePost)
        private readonly postRepo: Repository<FanpagePost>,
        @InjectRepository(FanpageUtm)
        private readonly linkRepo: Repository<FanpageUtm>,
        private readonly access: FanpageAccessService,
        private readonly scoped: FanpageScopedQuery,
        private readonly utmLinks: FanpageUtmsService,
        private readonly utmsService: UtmsService,
        private readonly utmCustomers: UtmCustomersService,
        private readonly uiVisibility: UiVisibilityService,
    ) {}

    private range(q: OutcomesQueryDto): { from: string; to: string } {
        const r = resolveStatsRange(q.from, q.to, todayVnStr());
        if (!r.ok) throw new BadRequestException(r.message);
        return { from: r.from, to: r.to };
    }

    async getOutcomes(user: FanpageCaller, q: OutcomesQueryDto): Promise<OutcomesResponse> {
        const { from, to } = this.range(q);

        const statsScopes = await this.access.scopesForKey(user, 'fanpage_stats.view');
        const pages = await this.scoped.load(user, statsScopes, { archived: 'all' }); // ném 403 nếu không có quyền xem
        const statsScope = statsScopes.view as string;
        const pageIds = pages.map((p) => p.id);
        const customerScope = await this.access.scopeOf(user, 'customers.view');

        const links = await this.loadLinks(pageIds);
        const utmIds = [...new Set(links.map((l) => l.utmId))];

        // ── cổng tiền (lớp 1 + 3) ──
        const revenueIds = await this.revenuePageIds(user, pageIds);
        const depositsHidden = (
            await this.uiVisibility.getHiddenElementKeys(user.role, 'customers', user.departmentId, user.positionId, user.isRootAdmin)
        ).has('tab:deposits');
        const moneyOn = customerScope != null && !depositsHidden && revenueIds.size > 0;

        const byUtm = customerScope ? await this.aggregateByUtm(user, customerScope, utmIds, from, to, moneyOn) : new Map<number, UtmAgg>();
        const byFanpage = customerScope ? await this.aggregateByFanpage(user, customerScope, pageIds, from, to, moneyOn) : new Map<number, UtmAgg>();
        const rows = buildPageOutcomes(pageIds, links, byUtm, byFanpage);
        const chips = await this.utmLinks.chipsForPages(pageIds, user);
        const postCounts = await this.countPosts(pageIds, from, to);

        const view = (b: OutcomeBucket, withMoney: boolean): BucketView => {
            const { deposit, ...rest } = b;
            return withMoney ? { ...rest, deposit } : rest;
        };

        const pageRows: PageOutcomeRow[] = pages.map((p, i) => {
            const o = rows[i];
            const withMoney = moneyOn && revenueIds.has(p.id);
            const posts = postCounts.get(p.id) ?? 0;
            return {
                fanpageId: p.id,
                name: p.name,
                archived: p.archivedAt != null,
                posts,
                customersPerPost: customersPerPost(o.primary.customers, posts),
                primary: view(o.primary, withMoney),
                participating: view(o.participating, withMoney),
                utms: (chips.get(p.id) ?? []).map((c) => this.utmRow(c, byUtm.get(c.utmId), withMoney)),
            };
        });

        // ── Tổng DISTINCT độc lập + Chưa quy về Page ──
        const primaryUtmIds = [...new Set(links.filter((l) => l.isPrimary).map((l) => l.utmId))];
        const totals = customerScope ? await this.distinctTotals(user, customerScope, pageIds, primaryUtmIds, from, to) : { customers: 0, closed: 0 };
        // Tổng tiền chỉ hiện khi MỌI Page được ghi công (Page chính của UTM + Page có Lead trực tiếp) đều được xem tiền (tránh suy ra số Page bị ẩn).
        const creditedPageIds = [...new Set([...links.filter((l) => l.isPrimary).map((l) => l.fanpageId), ...byFanpage.keys()])];
        const totalMoneyOk = moneyOn && creditedPageIds.every((id) => revenueIds.has(id));
        const totalDeposit =
            totalMoneyOk && customerScope ? await this.distinctDeposit(user, customerScope, pageIds, primaryUtmIds, from, to) : undefined;

        const broad = statsScope === 'all' || statsScope === 'department';
        const unassigned = broad && customerScope ? await this.unassignedTotals(user, customerScope, from, to) : null;

        return {
            from,
            to,
            statsScope,
            customerScope: customerScope ?? null,
            hasRevenue: pageRows.some((r) => r.primary.deposit !== undefined) || totalDeposit !== undefined,
            pages: pageRows,
            total: {
                customers: totals.customers,
                closed: totals.closed,
                closeRate: closeRate(totals.closed, totals.customers),
                ...(totalDeposit !== undefined ? { deposit: totalDeposit } : {}),
            },
            unassigned,
        };
    }

    /** Danh sách khách khi bấm số khách (tái dùng `UtmCustomersService.listForUtms`): cùng phạm vi + cùng UTM với số đã hiện. */
    async listCustomers(user: FanpageCaller, q: OutcomeCustomersQueryDto) {
        const { from, to } = this.range(q);
        const statsScopes = await this.access.scopesForKey(user, 'fanpage_stats.view');
        const pages = await this.scoped.load(user, statsScopes, { archived: 'all' });
        if (!pages.some((p) => p.id === q.fanpageId)) throw new ForbiddenException('Page không nằm trong phạm vi của bạn');

        const customerScope = await this.access.scopeOf(user, 'customers.view');
        const links = (await this.loadLinks([q.fanpageId])).filter((l) => (q.kind === 'primary' ? l.isPrimary : !l.isPrimary));
        const utmIds = links.map((l) => l.utmId);

        const result = await this.utmCustomers.listForUtms(
            utmIds,
            {
                from,
                to,
                status: q.status,
                search: q.search,
                page: q.page,
                limit: q.limit,
                // GĐ5b: danh sách khi bấm số PHẢI cùng tập khách với số đã hiện (ưu tiên `fanpage_id`, 15.3).
                credit: q.kind === 'primary' ? { mode: 'primary', fanpageId: q.fanpageId } : { mode: 'participating' },
            },
            user,
            customerScope,
        );

        // R7: che tên UTM hạn chế mà người xem không được dùng (mapRows của UTM không tự che).
        const usability = await this.utmsService.usabilityFor(user, utmIds);
        const data = result.data.map((row) => {
            const utm = row.utm as { id: number; name: string; color: string; isActive: boolean } | null;
            const info = utm ? usability.get(utm.id) : undefined;
            if (utm && info && info.restricted && !info.canUse) {
                return { ...row, utm: { ...utm, name: RESTRICTED_UTM_LABEL, color: null } };
            }
            return row;
        });
        return { ...result, data };
    }

    // ───────────── Nội bộ ─────────────

    private utmRow(c: FanpageUtmChip, agg: UtmAgg | undefined, withMoney: boolean): OutcomeUtmRow {
        return {
            utmId: c.utmId,
            name: c.name,
            locked: c.locked,
            isPrimary: c.isPrimary,
            primaryFanpage: c.primaryFanpage,
            customers: agg?.customers ?? 0,
            ...(withMoney ? { deposit: agg?.deposit ?? 0 } : {}),
        };
    }

    private async loadLinks(pageIds: number[]): Promise<UtmLinkRow[]> {
        const out: UtmLinkRow[] = [];
        for (const ids of chunk(pageIds, FANPAGE_BATCH_SIZE)) {
            if (ids.length === 0) continue;
            const rows = await this.linkRepo
                .createQueryBuilder('fu')
                .select(['fu.fanpageId', 'fu.utmId', 'fu.primaryUtmId'])
                .where('fu.fanpageId IN (:...ids)', { ids })
                .getMany();
            out.push(...rows.map((r) => ({ fanpageId: r.fanpageId, utmId: r.utmId, isPrimary: r.primaryUtmId != null })));
        }
        return out;
    }

    /** Page (trong `pageIds`) mà `fanpage_revenue.view` phủ tới (lớp 1 của cổng tiền). Thiếu quyền -> tập rỗng. */
    private async revenuePageIds(user: FanpageCaller, pageIds: number[]): Promise<Set<number>> {
        const scopes = await this.access.scopesForKey(user, 'fanpage_revenue.view');
        if (scopes.view == null) return new Set();
        const visible = await this.scoped.load(user, scopes, { archived: 'all' });
        const allowed = new Set(visible.map((p) => p.id));
        return new Set(pageIds.filter((id) => allowed.has(id)));
    }

    /** Khách (theo `input_date`) + tiền (theo `deposit_date`) gộp theo UTM, đã áp phạm vi `customers.view` (R6, R8). */
    private async aggregateByUtm(
        user: FanpageCaller,
        customerScope: string,
        utmIds: number[],
        from: string,
        to: string,
        withMoney: boolean,
    ): Promise<Map<number, UtmAgg>> {
        const out = new Map<number, UtmAgg>();
        const get = (id: number): UtmAgg => {
            let a = out.get(id);
            if (!a) {
                a = { customers: 0, closed: 0, deposit: 0 };
                out.set(id, a);
            }
            return a;
        };
        for (const ids of chunk(utmIds, FANPAGE_BATCH_SIZE)) {
            const qb = this.customerRepo
                .createQueryBuilder('customer')
                .select('customer.utmId', 'utmId')
                .addSelect('COUNT(*)', 'cnt')
                .addSelect("SUM(CASE WHEN customer.status = 'closed' THEN 1 ELSE 0 END)", 'closed')
                .where('customer.deletedAt IS NULL')
                .andWhere('customer.fanpageId IS NULL') // GĐ5b: khách có fanpage_id đã ghi công trực tiếp cho Page (15.3)
                .andWhere('customer.utmId IN (:...ids)', { ids })
                .andWhere('customer.inputDate >= :from AND customer.inputDate <= :to', { from, to })
                .groupBy('customer.utmId');
            CustomerAccessHelper.applyViewFilter(qb, user.id, user.role, customerScope);
            for (const r of await qb.getRawMany()) {
                const a = get(Number(r.utmId));
                a.customers = Number(r.cnt);
                a.closed = Number(r.closed);
            }

            if (!withMoney) continue;
            const dq = this.depositRepo
                .createQueryBuilder('dep')
                .innerJoin(Customer, 'customer', 'customer.id = dep.customerId') // loại khách xoá mềm (lớp 2)
                .select('customer.utmId', 'utmId')
                .addSelect('SUM(dep.amount)', 'total')
                .where('customer.deletedAt IS NULL')
                .andWhere('customer.fanpageId IS NULL')
                .andWhere('customer.utmId IN (:...ids)', { ids })
                .andWhere('dep.depositDate >= :from AND dep.depositDate <= :to', { from, to })
                .groupBy('customer.utmId');
            CustomerAccessHelper.applyViewFilter(dq, user.id, user.role, customerScope);
            for (const r of await dq.getRawMany()) get(Number(r.utmId)).deposit = Number(r.total ?? 0);
        }
        return out;
    }

    /** GĐ5b: khách (theo `input_date`) + tiền (theo `deposit_date`) ghi công TRỰC TIẾP cho Page (`fanpage_id`), đã áp phạm vi `customers.view`. */
    private async aggregateByFanpage(
        user: FanpageCaller,
        customerScope: string,
        pageIds: number[],
        from: string,
        to: string,
        withMoney: boolean,
    ): Promise<Map<number, UtmAgg>> {
        const out = new Map<number, UtmAgg>();
        const get = (id: number): UtmAgg => {
            let a = out.get(id);
            if (!a) {
                a = { customers: 0, closed: 0, deposit: 0 };
                out.set(id, a);
            }
            return a;
        };
        for (const ids of chunk(pageIds, FANPAGE_BATCH_SIZE)) {
            if (ids.length === 0) continue;
            const qb = this.customerRepo
                .createQueryBuilder('customer')
                .select('customer.fanpageId', 'fanpageId')
                .addSelect('COUNT(*)', 'cnt')
                .addSelect("SUM(CASE WHEN customer.status = 'closed' THEN 1 ELSE 0 END)", 'closed')
                .where('customer.deletedAt IS NULL')
                .andWhere('customer.fanpageId IN (:...ids)', { ids })
                .andWhere('customer.inputDate >= :from AND customer.inputDate <= :to', { from, to })
                .groupBy('customer.fanpageId');
            CustomerAccessHelper.applyViewFilter(qb, user.id, user.role, customerScope);
            for (const r of await qb.getRawMany()) {
                const a = get(Number(r.fanpageId));
                a.customers = Number(r.cnt);
                a.closed = Number(r.closed);
            }

            if (!withMoney) continue;
            const dq = this.depositRepo
                .createQueryBuilder('dep')
                .innerJoin(Customer, 'customer', 'customer.id = dep.customerId')
                .select('customer.fanpageId', 'fanpageId')
                .addSelect('SUM(dep.amount)', 'total')
                .where('customer.deletedAt IS NULL')
                .andWhere('customer.fanpageId IN (:...ids)', { ids })
                .andWhere('dep.depositDate >= :from AND dep.depositDate <= :to', { from, to })
                .groupBy('customer.fanpageId');
            CustomerAccessHelper.applyViewFilter(dq, user.id, user.role, customerScope);
            for (const r of await dq.getRawMany()) get(Number(r.fanpageId)).deposit = Number(r.total ?? 0);
        }
        return out;
    }

    /**
     * Tổng khách DISTINCT được ghi công trong phạm vi - đếm RIÊNG, không cộng các dòng Page (R4). Gồm 2 phần RỜI NHAU (nên cộng được):
     *  (a) khách có `fanpage_id` thuộc `pageIds`; (b) khách `fanpage_id` NULL có UTM mà Page chính nằm trong phạm vi (`utmIds`).
     */
    private async distinctTotals(
        user: FanpageCaller,
        customerScope: string,
        pageIds: number[],
        utmIds: number[],
        from: string,
        to: string,
    ): Promise<{ customers: number; closed: number }> {
        let customers = 0;
        let closed = 0;
        const run = async (apply: (qb: ReturnType<Repository<Customer>['createQueryBuilder']>) => void) => {
            const qb = this.customerRepo
                .createQueryBuilder('customer')
                .select('COUNT(DISTINCT customer.id)', 'cnt')
                .addSelect("COUNT(DISTINCT CASE WHEN customer.status = 'closed' THEN customer.id END)", 'closed')
                .where('customer.deletedAt IS NULL')
                .andWhere('customer.inputDate >= :from AND customer.inputDate <= :to', { from, to });
            apply(qb);
            CustomerAccessHelper.applyViewFilter(qb, user.id, user.role, customerScope);
            const r = await qb.getRawOne();
            customers += Number(r?.cnt ?? 0);
            closed += Number(r?.closed ?? 0);
        };
        for (const ids of chunk(pageIds, FANPAGE_BATCH_SIZE)) {
            if (ids.length === 0) continue;
            await run((qb) => qb.andWhere('customer.fanpageId IN (:...ids)', { ids }));
        }
        for (const ids of chunk(utmIds, FANPAGE_BATCH_SIZE)) {
            if (ids.length === 0) continue;
            await run((qb) => qb.andWhere('customer.fanpageId IS NULL').andWhere('customer.utmId IN (:...ids)', { ids }));
        }
        return { customers, closed };
    }

    private async distinctDeposit(
        user: FanpageCaller,
        customerScope: string,
        pageIds: number[],
        utmIds: number[],
        from: string,
        to: string,
    ): Promise<number> {
        let total = 0;
        const run = async (apply: (qb: ReturnType<Repository<Deposit>['createQueryBuilder']>) => void) => {
            const qb = this.depositRepo
                .createQueryBuilder('dep')
                .innerJoin(Customer, 'customer', 'customer.id = dep.customerId')
                .select('SUM(dep.amount)', 'total')
                .where('customer.deletedAt IS NULL')
                .andWhere('dep.depositDate >= :from AND dep.depositDate <= :to', { from, to });
            apply(qb);
            CustomerAccessHelper.applyViewFilter(qb, user.id, user.role, customerScope);
            total += Number((await qb.getRawOne())?.total ?? 0);
        };
        for (const ids of chunk(pageIds, FANPAGE_BATCH_SIZE)) {
            if (ids.length === 0) continue;
            await run((qb) => qb.andWhere('customer.fanpageId IN (:...ids)', { ids }));
        }
        for (const ids of chunk(utmIds, FANPAGE_BATCH_SIZE)) {
            if (ids.length === 0) continue;
            await run((qb) => qb.andWhere('customer.fanpageId IS NULL').andWhere('customer.utmId IN (:...ids)', { ids }));
        }
        return total;
    }

    /** R5: khách không có UTM, hoặc UTM chưa có Page chính nào (trong phạm vi `customers.view`). */
    private async unassignedTotals(user: FanpageCaller, customerScope: string, from: string, to: string): Promise<{ customers: number; closed: number }> {
        const qb = this.customerRepo
            .createQueryBuilder('customer')
            .select('COUNT(*)', 'cnt')
            .addSelect("SUM(CASE WHEN customer.status = 'closed' THEN 1 ELSE 0 END)", 'closed')
            .where('customer.deletedAt IS NULL')
            .andWhere('customer.inputDate >= :from AND customer.inputDate <= :to', { from, to })
            .andWhere('customer.fanpageId IS NULL') // GĐ5b: khách có fanpage_id luôn đã được ghi công (không phải "Chưa quy về Page")
            .andWhere('(customer.utmId IS NULL OR customer.utmId NOT IN (SELECT fu.utm_id FROM fanpage_utms fu WHERE fu.primary_utm_id IS NOT NULL))');
        CustomerAccessHelper.applyViewFilter(qb, user.id, user.role, customerScope);
        const r = await qb.getRawOne();
        return { customers: Number(r?.cnt ?? 0), closed: Number(r?.closed ?? 0) };
    }

    private async countPosts(pageIds: number[], from: string, to: string): Promise<Map<number, number>> {
        const out = new Map<number, number>();
        for (const ids of chunk(pageIds, FANPAGE_BATCH_SIZE)) {
            if (ids.length === 0) continue;
            const rows = await this.postRepo
                .createQueryBuilder('post')
                .select('post.fanpageId', 'fanpageId')
                .addSelect('COUNT(*)', 'cnt')
                .where('post.fanpageId IN (:...ids)', { ids })
                .andWhere('post.postedDate >= :from AND post.postedDate <= :to', { from, to })
                .groupBy('post.fanpageId')
                .getRawMany();
            for (const r of rows) out.set(Number(r.fanpageId), Number(r.cnt));
        }
        return out;
    }
}
