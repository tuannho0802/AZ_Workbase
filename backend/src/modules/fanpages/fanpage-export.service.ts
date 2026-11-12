import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FanpageMetricSnapshot } from '../../database/entities/fanpage-metric-snapshot.entity';
import { FanpagePost } from '../../database/entities/fanpage-post.entity';
import { Fanpage } from '../../database/entities/fanpage.entity';
import { todayVnStr } from '../../common/utils/date-vn.util';
import { toPascalSlug } from '../../common/utils/vietnamese-slug.util';
import { AuditService } from '../audit/audit.service';
import { FanpageExportQueryDto } from './dto/fanpage-export.dto';
import { FanpageAccessService, FanpageCaller } from './fanpage-access.service';
import { buildFanpageExportBuffer } from './fanpage-export.excel';
import {
    ExportOutcomes,
    ExportPageRow,
    ExportPostRow,
    ExportSnapshotRow,
    FANPAGE_EXPORT_ROW_CAP,
    FanpageExportModel,
    buildFanpageExportModel,
} from './fanpage-export.model';
import { FANPAGE_BATCH_SIZE, FanpageInsightsService } from './fanpage-insights.service';
import { FanpageMetricsService } from './fanpage-metrics.service';
import { FanpageOutcomesService } from './fanpage-outcomes.service';
import { FanpageScopedQuery } from './fanpage-scoped-query';
import { FanpageAccessHelper } from './helpers/fanpage-access.helper';
import { resolveStatsRange } from './helpers/fanpage-metrics.helper';

const chunk = <T>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
};

export type FanpageExportViewer = FanpageCaller & { name?: string };

/**
 * A4 - Xuất Excel Fanpage (sheet Page / Bài đăng / Số liệu / Khách & Tiền nạp). Cổng quyền (PLAN 3.7, GĐ6):
 *  - Page được xuất = scope của `fanpages.export` (dựng bằng CÙNG `FanpageScopedQuery` với danh sách);
 *  - Bài đăng / Số liệu / Follower chỉ lấy của Page nằm trong scope `fanpages.view` của người xuất (đúng cổng của các endpoint xem tương ứng);
 *  - Sheet \"Số liệu\" chỉ khi có `fanpages.view`; sheet \"Khách & Tiền nạp\" chỉ khi có `fanpage_stats.view` VÀ có phạm vi khách `customers.view`;
 *  - Cột tiền chỉ khi `FanpageOutcomesService` xác nhận qua đủ cổng 4 lớp (service đó BỎ HẲN trường tiền khi không qua) - export không tự tính tiền.
 * Trần 20.000 dòng/sheet (cắt + ghi chú trên sheet).
 */
@Injectable()
export class FanpageExportService {
    constructor(
        @InjectRepository(FanpagePost)
        private readonly postRepo: Repository<FanpagePost>,
        @InjectRepository(FanpageMetricSnapshot)
        private readonly snapRepo: Repository<FanpageMetricSnapshot>,
        private readonly access: FanpageAccessService,
        private readonly scoped: FanpageScopedQuery,
        private readonly insights: FanpageInsightsService,
        private readonly metrics: FanpageMetricsService,
        private readonly outcomes: FanpageOutcomesService,
        private readonly auditService: AuditService,
    ) { }

    async buildModel(user: FanpageExportViewer, q: FanpageExportQueryDto): Promise<FanpageExportModel> {
        const exportScopes = await this.access.scopesForKey(user, 'fanpages.export');
        const exportScope = exportScopes.view;
        if (exportScope !== 'own' && exportScope !== 'department' && exportScope !== 'all') {
            throw new ForbiddenException('Bạn không có quyền xuất Excel Fanpage');
        }
        if (q.from && q.to && q.from > q.to) throw new BadRequestException('"Từ ngày" phải trước hoặc bằng "Đến ngày"');

        const { cadence, from, to, ...sqlFilters } = q;
        const allPages = await this.scoped.load(user, exportScopes, sqlFilters);

        const [insights, latest] = await Promise.all([this.insights.forPages(allPages), this.metrics.latestFollowers(allPages.map((p) => p.id))]);
        const pagesAll = allPages.map((p) => ({ page: p, ins: insights.get(p.id) }));
        const filtered = cadence ? pagesAll.filter((x) => x.ins?.cadence.state === cadence) : pagesAll;
        const pagesTruncated = filtered.length > FANPAGE_EXPORT_ROW_CAP;
        const kept = filtered.slice(0, FANPAGE_EXPORT_ROW_CAP);
        const pages = kept.map((x) => x.page);
        const pageName = new Map(pages.map((p) => [p.id, p.name]));

        // Cổng xem dữ liệu chi tiết: scope `fanpages.view` phủ tới TỪNG Page (bài đăng + số liệu + follower).
        const viewScope = await this.access.scopeOf(user, 'fanpages.view');
        const managed = viewScope === 'department' ? await this.access.managedDepartmentIds(user.id) : [];
        const viewableIds = new Set(
            viewScope ? pages.filter((p) => FanpageAccessHelper.allows(viewScope, this.access.buildContext(p, user.id, managed))).map((p) => p.id) : [],
        );
        const includeMetrics = viewScope != null;

        const pageRows: ExportPageRow[] = kept.map(({ page: p, ins }) => {
            const lm = viewableIds.has(p.id) ? latest.get(p.id) : undefined;
            return {
                name: p.name,
                platform: p.platform?.name ?? null,
                url: p.url,
                owners: (p.owners ?? []).map((o) => o.name),
                health: p.healthStatus?.name ?? null,
                isTracked: ins?.isTracked ?? false,
                archived: p.archivedAt != null,
                cadenceState: ins?.cadence.state ?? 'paused',
                weekCount: ins?.weekCount ?? 0,
                target: p.targetPostsPerWeek ?? null,
                posts30d: ins?.posts30d ?? 0,
                lastPostDate: ins?.lastPostDate ?? null,
                postCount: ins?.postCount ?? 0,
                followers: lm?.followers ?? null,
                followersDate: lm?.date ?? null,
            };
        });

        const viewIds = [...viewableIds];
        const postsRes = await this.loadPosts(viewIds, from, to);
        const posts: ExportPostRow[] = postsRes.rows.map((p) => ({
            pageName: pageName.get(p.fanpageId) ?? '',
            postedDate: p.postedDate ?? null,
            postType: p.postType?.name ?? null,
            title: p.title ?? null,
            url: p.url,
            createdBy: p.createdBy?.name ?? null,
            views: p.views ?? null,
            likes: p.likes ?? null,
            comments: p.comments ?? null,
            shares: p.shares ?? null,
            note: p.note ?? null,
        }));

        let snapshots: ExportSnapshotRow[] = [];
        let snapsTruncated = false;
        if (includeMetrics) {
            const snapsRes = await this.loadSnapshots(viewIds, from, to);
            snapsTruncated = snapsRes.truncated;
            snapshots = snapsRes.rows.map((s) => ({
                pageName: pageName.get(s.fanpageId) ?? '',
                date: s.snapshotDate,
                followers: s.followers ?? null,
                reach: s.reach ?? null,
                engagement: s.engagement ?? null,
                views: s.views ?? null,
                note: s.note ?? null,
                createdBy: s.createdBy?.name ?? null,
            }));
        }

        const outcomes = await this.loadOutcomes(user, from, to);

        return buildFanpageExportModel({
            pages: pageRows,
            posts,
            snapshots,
            includeMetrics,
            outcomes,
            period: { from: from ?? null, to: to ?? null },
            truncated: { pages: pagesTruncated, posts: postsRes.truncated, snapshots: snapsTruncated },
        });
    }

    async export(
        user: FanpageExportViewer,
        q: FanpageExportQueryDto,
        ip?: string,
        userAgent?: string,
    ): Promise<{ buffer: Buffer; filename: string }> {
        const model = await this.buildModel(user, q);
        const generatedAtText = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const buffer = await buildFanpageExportBuffer(model, { exportedByName: user.name, generatedAtText });

        this.auditService.logActionAsync(
            user.id,
            'EXPORT_FANPAGES',
            'fanpage',
            0,
            null,
            {
                period: model.period,
                filters: { platformId: q.platformId ?? null, ownerId: q.ownerId ?? null, healthStatusId: q.healthStatusId ?? null, cadence: q.cadence ?? null, archived: q.archived ?? 'false' },
                sheets: model.sheets.map((s) => ({ name: s.name, rows: s.table.totalRows })),
            },
            ip,
            userAgent,
        );

        const nameSlug = user.name ? toPascalSlug(user.name) : '';
        const span = model.period.from && model.period.to ? `${model.period.from}_${model.period.to}` : todayVnStr();
        return { buffer, filename: `Fanpage_${span}${nameSlug ? `_ExportBy-${nameSlug}` : ''}.xlsx` };
    }

    /** Bài của các Page được phép xem; ngày lọc theo `posted_date` (bài chưa có ngày chỉ có khi KHÔNG lọc kỳ). Dừng ở trần dòng. */
    private async loadPosts(ids: number[], from?: string, to?: string): Promise<{ rows: FanpagePost[]; truncated: boolean }> {
        const rows: FanpagePost[] = [];
        for (const batch of chunk(ids, FANPAGE_BATCH_SIZE)) {
            const remaining = FANPAGE_EXPORT_ROW_CAP + 1 - rows.length;
            if (remaining <= 0) break;
            const qb = this.postRepo
                .createQueryBuilder('p')
                .leftJoin('p.createdBy', 'createdBy')
                .addSelect(['createdBy.id', 'createdBy.name'])
                .leftJoin('p.postType', 'postType')
                .addSelect(['postType.id', 'postType.name'])
                .where('p.fanpageId IN (:...ids)', { ids: batch });
            if (from) qb.andWhere('p.postedDate >= :from', { from });
            if (to) qb.andWhere('p.postedDate <= :to', { to });
            qb.orderBy('p.fanpageId', 'ASC').addOrderBy('p.postedDate', 'DESC').addOrderBy('p.id', 'DESC').limit(remaining);
            rows.push(...(await qb.getMany()));
        }
        return this.cap(rows);
    }

    private async loadSnapshots(ids: number[], from?: string, to?: string): Promise<{ rows: FanpageMetricSnapshot[]; truncated: boolean }> {
        const rows: FanpageMetricSnapshot[] = [];
        for (const batch of chunk(ids, FANPAGE_BATCH_SIZE)) {
            const remaining = FANPAGE_EXPORT_ROW_CAP + 1 - rows.length;
            if (remaining <= 0) break;
            const qb = this.snapRepo
                .createQueryBuilder('s')
                .leftJoin('s.createdBy', 'createdBy')
                .addSelect(['createdBy.id', 'createdBy.name'])
                .where('s.fanpageId IN (:...ids)', { ids: batch });
            if (from) qb.andWhere('s.snapshotDate >= :from', { from });
            if (to) qb.andWhere('s.snapshotDate <= :to', { to });
            qb.orderBy('s.fanpageId', 'ASC').addOrderBy('s.snapshotDate', 'DESC').limit(remaining);
            rows.push(...(await qb.getMany()));
        }
        return this.cap(rows);
    }

    private cap<T>(rows: T[]): { rows: T[]; truncated: boolean } {
        return rows.length > FANPAGE_EXPORT_ROW_CAP ? { rows: rows.slice(0, FANPAGE_EXPORT_ROW_CAP), truncated: true } : { rows, truncated: false };
    }

    /**
     * Khối Khách & Tiền nạp: chỉ khi có `fanpage_stats.view`, kỳ hợp lệ (≤ 366 ngày, không ở tương lai) và có phạm vi khách.
     * Mọi cổng khách/tiền do `FanpageOutcomesService` thực thi - ở đây chỉ chuyển dạng, KHÔNG tự thêm trường tiền.
     */
    private async loadOutcomes(user: FanpageCaller, from?: string, to?: string): Promise<ExportOutcomes | null> {
        const statsScope = await this.access.scopeOf(user, 'fanpage_stats.view');
        if (!statsScope) return null;
        const range = resolveStatsRange(from, to, todayVnStr());
        if (!range.ok) return null;

        const o = await this.outcomes.getOutcomes(user, { from: range.from, to: range.to });
        if (o.customerScope == null) return null;
        return {
            from: o.from,
            to: o.to,
            hasRevenue: o.hasRevenue,
            rows: o.pages.map((r) => ({
                name: r.name,
                archived: r.archived,
                posts: r.posts,
                primaryCustomers: r.primary.customers,
                primaryClosed: r.primary.closed,
                primaryCloseRate: r.primary.closeRate,
                ...(r.primary.deposit !== undefined ? { primaryDeposit: r.primary.deposit } : {}),
                participatingCustomers: r.participating.customers,
                participatingClosed: r.participating.closed,
                customersPerPost: r.customersPerPost,
            })),
            total: o.total,
            unassigned: o.unassigned,
        };
    }
}

export type { Fanpage };