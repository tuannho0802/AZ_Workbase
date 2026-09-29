import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import { User } from '../../database/entities/user.entity';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { Role } from '../../common/enums/role.enum';
import { CustomerAccessHelper } from '../customers/helpers/customer-access.helper';
import { QueryMarketingReportDto } from './dto/query-marketing-report.dto';
import { applyMarketingOwnOnly } from './report-scope.util';
import {
  ResolvedReportRange,
  resolvePreviousReportRange,
  resolveReportRange,
  spanDaysOf,
} from './report-range.util';

/** Kỳ dài hơn ngưỡng này thì biểu đồ xu hướng gộp theo THÁNG (tránh hàng trăm cột ngày). */
export const MONTH_GRANULARITY_THRESHOLD_DAYS = 92;

/** Key "chưa gán" khi group theo user (marketing_user_id/created_by_id IS NULL). */
export const UNASSIGNED_KEY = 0;

/** Số chỉ số cho 1 nhóm (1 Marketing / 1 người tạo / 1 nguồn / toàn bộ). */
export interface MarketingMetrics {
  /** Data MỚI đổ về trong kỳ (customer.createdAt). */
  totalCustomers: number;
  /** status='closed' VÀ closedDate trong kỳ. */
  closedCustomers: number;
  /** Khách có ≥1 lượt join nhóm (joined_at) trong kỳ. */
  joinedGroupCustomers: number;
  /** Số KHÁCH có ≥1 khoản nạp (deposit_date) trong kỳ - bất kể khách tạo lúc nào. */
  depositedCustomers: number;
  /** Tổng tiền nạp (deposit_date trong kỳ) - bất kể khách tạo lúc nào. */
  revenue: number;
  /** COHORT: trong số data MỚI đổ về trong kỳ, bao nhiêu khách ĐÃ TỪNG nạp (bất kỳ lúc nào). Luôn ≤ totalCustomers. */
  cohortDepositedCustomers: number;
}

export interface MarketingUserRow extends MarketingMetrics {
  /** 0 = chưa gán. */
  userId: number;
  userName: string;
  /** Phòng ban CỦA NHÂN VIÊN (không phải của khách hàng). */
  departmentId: number | null;
  departmentName: string | null;
  departmentColor: string | null;
  /** Phân bố data mới trong kỳ theo status hiện tại - đủ mặt mọi status (kể cả 0). */
  byStatus: Record<string, number>;
}

export interface MarketingSourceRow extends MarketingMetrics {
  source: string;
}

export interface MarketingTrendPoint {
  /** 'YYYY-MM-DD' (granularity=day) hoặc 'YYYY-MM' (granularity=month). */
  date: string;
  newCustomers: number;
  closedCustomers: number;
  revenue: number;
  depositedCustomers: number;
}

const zeroMetrics = (): MarketingMetrics => ({
  totalCustomers: 0,
  closedCustomers: 0,
  joinedGroupCustomers: 0,
  depositedCustomers: 0,
  revenue: 0,
  cohortDepositedCustomers: 0,
});

export interface FilterSet {
  marketingUserId?: number;
  createdById?: number;
  source?: string;
}

interface Ctx {
  viewerId: number;
  viewerRole: string;
  scope?: string | null;
  filters: FilterSet;
  range: ResolvedReportRange;
}

interface GroupSpec {
  expr: string;
}

export type UserInfo = {
  name: string;
  departmentId: number | null;
  departmentName: string | null;
  departmentColor: string | null;
  // Đủ để FE vẽ dropdown user GIỐNG trang Khách hàng (Avatar theo màu vai trò + Tag Vai trò/Phòng ban/Vị trí).
  role: string | null;
  positionName: string | null;
  positionColor: string | null;
};

/**
 * BÁO CÁO MARKETING - phân tích ĐA CHIỀU theo "Marketing phụ trách"
 * (`customers.marketing_user_id`) và "Người tạo data" (`customers.created_by_id`).
 *
 * Vì sao có báo cáo này: 3 tab cũ chỉ group theo `sales_user_id` - nhân viên Marketing
 * (là người nhập data, phòng ban Marketing) KHÔNG xuất hiện, dù chính họ đem khách về
 * và khách đó nạp tiền qua Sales. Ở đây doanh số/khách nạp được quy về CẢ Marketing
 * phụ trách lẫn Người tạo - độc lập với Sales phụ trách (1 khách có Sales vẫn tính cho Marketing).
 *
 * QUY ƯỚC MỖI CHỈ SỐ - mỗi chỉ số dùng cột ngày RIÊNG của nó (cùng quy ước với
 * `ReportsService`, đọc giải thích múi giờ ở đó + report-range.util.ts):
 *  - totalCustomers / cohortDepositedCustomers: `created_at` (UTC thật -> fromUtc/toUtc)
 *  - closedCustomers: `closed_date` (cột date, naive from/to)
 *  - joinedGroupCustomers: `customer_group_memberships.joined_at` (timestamp UTC -> fromUtc/toUtc)
 *  - depositedCustomers / revenue: `deposits.deposit_date` (cột date, naive from/to)
 * => các chỉ số KHÁC cột ngày nên KHÔNG được chia cho nhau để ra "tỷ lệ" trừ khi cùng cohort;
 * tỷ lệ chuẩn duy nhất là `cohortDepositedCustomers / totalCustomers` (≤ 100%).
 *
 * PHÂN QUYỀN: thuần theo `scope` (xem CustomerAccessHelper.applyViewFilter). Riêng
 * scope='own' còn bị siết thêm: chỉ tính khách mà CHÍNH MÌNH là Marketing phụ trách hoặc
 * người tạo, và chỉ hiện đúng dòng của mình (không lộ số của Marketing khác cùng chăm 1 khách).
 * KHÔNG dùng permission key mới - dùng lại `reports.view`.
 *
 * Tính ON-DEMAND bằng SQL aggregation (cùng quyết định thiết kế với ReportsService: không cache DB).
 */
@Injectable()
export class ReportsMarketingService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(CustomerStatus)
    private readonly customerStatusRepo: Repository<CustomerStatus>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // ═══════════════════════════ ENTRY ═══════════════════════════

  async getMarketingReport(
    query: QueryMarketingReportDto,
    viewerId: number,
    viewerRole: string,
    scope?: string | null,
  ) {
    const range = resolveReportRange(query);
    const prevRange = resolvePreviousReportRange(query);
    const spanDays = spanDaysOf(range);
    const granularity: 'day' | 'month' = spanDays > MONTH_GRANULARITY_THRESHOLD_DAYS ? 'month' : 'day';

    const filters: FilterSet = {
      marketingUserId: query.marketingUserId,
      createdById: query.createdById,
      source: query.source,
    };
    const ctx: Ctx = { viewerId, viewerRole, scope, filters, range };
    const prevCtx: Ctx = { ...ctx, range: prevRange };
    const isOwnOnly = this.isOwnOnly(ctx);

    const statuses = await this.customerStatusRepo.find({ order: { sortOrder: 'ASC', id: 'ASC' } });
    const statusMeta = statuses.map((s) => ({ code: s.code, name: s.name, color: s.color }));
    const statusCodes = statuses.map((s) => s.code);

    const [
      summaryMap,
      prevSummaryMap,
      marketingMetrics,
      creatorMetrics,
      marketingStatus,
      creatorStatus,
      sourceMetrics,
      trend,
      attribution,
      optionsRaw,
    ] = await Promise.all([
      this.collectMetrics(ctx, null),
      this.collectMetrics(prevCtx, null),
      this.collectMetrics(ctx, { expr: 'IFNULL(customer.marketingUserId, 0)' }),
      this.collectMetrics(ctx, { expr: 'IFNULL(customer.createdById, 0)' }),
      this.collectStatusPivot(ctx, 'IFNULL(customer.marketingUserId, 0)'),
      this.collectStatusPivot(ctx, 'IFNULL(customer.createdById, 0)'),
      this.collectMetrics(ctx, { expr: 'customer.source' }),
      this.collectTrend(ctx, granularity),
      this.collectAttribution(ctx),
      this.loadOptionIds(ctx),
    ]);

    // Với scope='own': chỉ giữ đúng dòng của chính mình (xem JSDoc class).
    const keepUserKey = (k: string) => !isOwnOnly || Number(k) === viewerId;

    // Gom mọi userId cần tên (dòng bảng + option dropdown) -> 1 query duy nhất.
    const userIds = new Set<number>();
    for (const k of marketingMetrics.keys()) if (keepUserKey(k) && Number(k) > 0) userIds.add(Number(k));
    for (const k of creatorMetrics.keys()) if (keepUserKey(k) && Number(k) > 0) userIds.add(Number(k));
    optionsRaw.marketerIds.forEach((id) => userIds.add(id));
    optionsRaw.creatorIds.forEach((id) => userIds.add(id));
    const users = await this.loadUsers([...userIds]);

    const total = summaryMap.get('_all') ?? zeroMetrics();
    const prevTotal = prevSummaryMap.get('_all') ?? zeroMetrics();

    const marketing = this.buildUserRows(
      marketingMetrics,
      marketingStatus,
      statusCodes,
      users,
      '(Chưa gán Marketing)',
      keepUserKey,
    );
    const creators = this.buildUserRows(
      creatorMetrics,
      creatorStatus,
      statusCodes,
      users,
      '(Không rõ người tạo)',
      keepUserKey,
    );

    const bySource: MarketingSourceRow[] = [...sourceMetrics.entries()]
      .map(([source, m]) => ({ source: source || '(Không rõ)', ...m }))
      .sort((a, b) => b.revenue - a.revenue || b.totalCustomers - a.totalCustomers);

    // Tổng theo status (data mới trong kỳ) = cộng dồn từ dòng Marketing (mỗi khách đúng 1 dòng, kể cả bucket chưa gán).
    // KHÔNG cộng từ dòng đã lọc keepUserKey - dùng pivot thô để scope='own' vẫn khớp `total`.
    const totalByStatus: Record<string, number> = Object.fromEntries(statusCodes.map((c) => [c, 0]));
    for (const [k, byStatus] of marketingStatus.entries()) {
      if (!keepUserKey(k)) continue;
      for (const [code, n] of Object.entries(byStatus)) {
        if (code in totalByStatus) totalByStatus[code] += n;
      }
    }

    const nameOf = (id: number) => users.get(id)?.name ?? '(Không rõ)';
    const label = (id: number) => {
      const u = users.get(id);
      return u
        ? {
            id,
            name: u.name,
            departmentName: u.departmentName,
            departmentColor: u.departmentColor,
            role: u.role,
            positionName: u.positionName,
            positionColor: u.positionColor,
          }
        : {
            id,
            name: nameOf(id),
            departmentName: null,
            departmentColor: null,
            role: null,
            positionName: null,
            positionColor: null,
          };
    };

    return {
      period: {
        type: query.period,
        from: range.from,
        to: range.to,
        granularity,
        spanDays,
      },
      previousPeriod: { from: prevRange.from, to: prevRange.to },
      appliedFilters: filters,
      /** true = người xem chỉ thấy số của chính mình (scope='own'), FE hiện ghi chú. */
      ownOnly: isOwnOnly,
      options: {
        marketers: optionsRaw.marketerIds.map(label).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
        creators: optionsRaw.creatorIds.map(label).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
        sources: optionsRaw.sources,
      },
      statuses: statusMeta,
      summary: {
        current: total,
        previous: prevTotal,
        /** Data mới CHƯA gán Marketing - độ phủ dữ liệu: càng cao thì số theo Marketing càng thiếu. */
        unassignedMarketingCustomers: marketingMetrics.get(String(UNASSIGNED_KEY))?.totalCustomers ?? 0,
        totalByStatus,
      },
      attribution,
      marketing,
      creators,
      bySource,
      trend,
    };
  }

  // ═══════════════════════════ QUERY BUILDING BLOCKS ═══════════════════════════

  private isOwnOnly(ctx: Ctx): boolean {
    return ctx.scope === PermissionScope.OWN && ctx.viewerRole !== Role.ADMIN;
  }

  /**
   * QueryBuilder gốc: phạm vi RBAC (nguồn chân lý duy nhất = CustomerAccessHelper)
   * + siết thêm cho scope='own' + các bộ lọc người dùng chọn.
   */
  private baseQb(ctx: Ctx, applyUserFilters = true): SelectQueryBuilder<Customer> {
    const qb = this.customerRepo.createQueryBuilder('customer');
    CustomerAccessHelper.applyViewFilter(qb, ctx.viewerId, ctx.viewerRole, ctx.scope);

    if (this.isOwnOnly(ctx)) applyMarketingOwnOnly(qb, ctx.viewerId);

    if (!applyUserFilters) return qb;
    const f = ctx.filters;
    if (f.marketingUserId !== undefined) {
      if (f.marketingUserId === UNASSIGNED_KEY) qb.andWhere('customer.marketingUserId IS NULL');
      else qb.andWhere('customer.marketingUserId = :fMarketing', { fMarketing: f.marketingUserId });
    }
    if (f.createdById !== undefined) {
      if (f.createdById === UNASSIGNED_KEY) qb.andWhere('customer.createdById IS NULL');
      else qb.andWhere('customer.createdById = :fCreator', { fCreator: f.createdById });
    }
    if (f.source) qb.andWhere('customer.source = :fSource', { fSource: f.source });
    return qb;
  }

  /**
   * 3 query (main / joined / deposits) rồi gộp Map theo key - cùng lý do như
   * `ReportsService.mergeBreakdown()`: 1 nhóm có thể xuất hiện ở bảng này mà không có ở bảng kia.
   * `group = null` -> 1 dòng tổng, key '_all'.
   */
  private async collectMetrics(ctx: Ctx, group: GroupSpec | null): Promise<Map<string, MarketingMetrics>> {
    const { range } = ctx;
    const result = new Map<string, MarketingMetrics>();
    const upsert = (key: string) => {
      let m = result.get(key);
      if (!m) {
        m = zeroMetrics();
        result.set(key, m);
      }
      return m;
    };
    const applyGroup = (qb: SelectQueryBuilder<Customer>) => {
      if (group) return qb.select(group.expr, 'k').groupBy(group.expr);
      return qb.select('1', '_dummy'); // BẮT BUỘC: tránh SELECT customer.* lẫn hàm tổng hợp (ONLY_FULL_GROUP_BY)
    };
    const keyOf = (row: any) => (group ? String(row.k ?? '') : '_all');

    const mainQ = applyGroup(this.baseQb(ctx))
      .addSelect(
        'SUM(CASE WHEN customer.createdAt BETWEEN :createdFrom AND :createdTo THEN 1 ELSE 0 END)',
        'total',
      )
      .addSelect(
        "SUM(CASE WHEN customer.status = 'closed' AND customer.closedDate BETWEEN :closedFrom AND :closedTo THEN 1 ELSE 0 END)",
        'closed',
      )
      .addSelect(
        'SUM(CASE WHEN customer.createdAt BETWEEN :createdFrom AND :createdTo ' +
          'AND EXISTS (SELECT 1 FROM deposits dd WHERE dd.customer_id = customer.id) THEN 1 ELSE 0 END)',
        'cohortDeposited',
      )
      .setParameters({
        createdFrom: range.fromUtc,
        createdTo: range.toUtc,
        closedFrom: range.from,
        closedTo: range.to,
      });

    const joinedQ = applyGroup(
      this.baseQb(ctx).innerJoin(
        CustomerGroupMembership,
        'membership',
        'membership.customer_id = customer.id AND membership.joined = true AND membership.joined_at BETWEEN :joinedFrom AND :joinedTo',
        { joinedFrom: range.fromUtc, joinedTo: range.toUtc },
      ),
    ).addSelect('COUNT(DISTINCT customer.id)', 'joined');

    const depositQ = applyGroup(
      this.baseQb(ctx)
        .innerJoin('customer.deposits', 'deposit')
        .andWhere('deposit.depositDate BETWEEN :depFrom AND :depTo', { depFrom: range.from, depTo: range.to }),
    )
      .addSelect('COUNT(DISTINCT customer.id)', 'depositors')
      .addSelect('SUM(deposit.amount)', 'revenue');

    const [mainRows, joinedRows, depositRows] = await Promise.all([
      mainQ.getRawMany(),
      joinedQ.getRawMany(),
      depositQ.getRawMany(),
    ]);

    for (const r of mainRows) {
      const m = upsert(keyOf(r));
      m.totalCustomers = Number(r.total) || 0;
      m.closedCustomers = Number(r.closed) || 0;
      m.cohortDepositedCustomers = Number(r.cohortDeposited) || 0;
    }
    for (const r of joinedRows) upsert(keyOf(r)).joinedGroupCustomers = Number(r.joined) || 0;
    for (const r of depositRows) {
      const m = upsert(keyOf(r));
      m.depositedCustomers = Number(r.depositors) || 0;
      m.revenue = Number(r.revenue) || 0;
    }
    if (!group && !result.has('_all')) result.set('_all', zeroMetrics());
    return result;
  }

  /** Data mới trong kỳ chia theo (nhóm, status hiện tại) -> Map<key, {statusCode: count}>. */
  private async collectStatusPivot(ctx: Ctx, expr: string): Promise<Map<string, Record<string, number>>> {
    const rows = await this.baseQb(ctx)
      .andWhere('customer.createdAt BETWEEN :createdFrom AND :createdTo', {
        createdFrom: ctx.range.fromUtc,
        createdTo: ctx.range.toUtc,
      })
      .select(expr, 'k')
      .addSelect('customer.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy(expr)
      .addGroupBy('customer.status')
      .getRawMany();

    const map = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const key = String(r.k ?? '');
      const entry = map.get(key) ?? {};
      entry[String(r.status)] = (entry[String(r.status)] ?? 0) + (Number(r.cnt) || 0);
      map.set(key, entry);
    }
    return map;
  }

  /** Xu hướng theo ngày/tháng của 3 chỉ số theo thời gian, ĐÃ ĐIỀN 0 cho ngày/tháng trống. */
  private async collectTrend(ctx: Ctx, granularity: 'day' | 'month'): Promise<MarketingTrendPoint[]> {
    const { range } = ctx;
    const f = granularity === 'month' ? '%Y-%m' : '%Y-%m-%d';
    // created_at là UTC thật -> +7h để quy ra NGÀY giờ VN trước khi gom.
    const createdBucket = `DATE_FORMAT(DATE_ADD(customer.createdAt, INTERVAL 7 HOUR), '${f}')`;
    const closedBucket = `DATE_FORMAT(customer.closedDate, '${f}')`;
    const depositBucket = `DATE_FORMAT(deposit.depositDate, '${f}')`;

    const [newRows, closedRows, depositRows] = await Promise.all([
      this.baseQb(ctx)
        .andWhere('customer.createdAt BETWEEN :createdFrom AND :createdTo', {
          createdFrom: range.fromUtc,
          createdTo: range.toUtc,
        })
        .select(createdBucket, 'b')
        .addSelect('COUNT(*)', 'n')
        .groupBy(createdBucket)
        .getRawMany(),
      this.baseQb(ctx)
        .andWhere("customer.status = 'closed'")
        .andWhere('customer.closedDate BETWEEN :closedFrom AND :closedTo', {
          closedFrom: range.from,
          closedTo: range.to,
        })
        .select(closedBucket, 'b')
        .addSelect('COUNT(*)', 'n')
        .groupBy(closedBucket)
        .getRawMany(),
      this.baseQb(ctx)
        .innerJoin('customer.deposits', 'deposit')
        .andWhere('deposit.depositDate BETWEEN :depFrom AND :depTo', { depFrom: range.from, depTo: range.to })
        .select(depositBucket, 'b')
        .addSelect('SUM(deposit.amount)', 'revenue')
        .addSelect('COUNT(DISTINCT customer.id)', 'depositors')
        .groupBy(depositBucket)
        .getRawMany(),
    ]);

    const points = new Map<string, MarketingTrendPoint>();
    for (const b of this.buildBuckets(range, granularity)) {
      points.set(b, { date: b, newCustomers: 0, closedCustomers: 0, revenue: 0, depositedCustomers: 0 });
    }
    const at = (b: unknown) => points.get(String(b));
    for (const r of newRows) {
      const p = at(r.b);
      if (p) p.newCustomers = Number(r.n) || 0;
    }
    for (const r of closedRows) {
      const p = at(r.b);
      if (p) p.closedCustomers = Number(r.n) || 0;
    }
    for (const r of depositRows) {
      const p = at(r.b);
      if (p) {
        p.revenue = Number(r.revenue) || 0;
        p.depositedCustomers = Number(r.depositors) || 0;
      }
    }
    return [...points.values()];
  }

  /**
   * Đối soát 2 chiều Marketing phụ trách vs Người tạo (data mới trong kỳ):
   * cho biết số liệu theo "Người tạo" và theo "Marketing phụ trách" khác nhau ở bao nhiêu khách.
   */
  private async collectAttribution(ctx: Ctx) {
    const row = await this.baseQb(ctx)
      .andWhere('customer.createdAt BETWEEN :createdFrom AND :createdTo', {
        createdFrom: ctx.range.fromUtc,
        createdTo: ctx.range.toUtc,
      })
      .select('1', '_dummy')
      .addSelect('SUM(CASE WHEN customer.marketingUserId IS NULL THEN 1 ELSE 0 END)', 'noMarketing')
      .addSelect(
        'SUM(CASE WHEN customer.marketingUserId IS NOT NULL AND customer.createdById IS NOT NULL ' +
          'AND customer.marketingUserId = customer.createdById THEN 1 ELSE 0 END)',
        'same',
      )
      .addSelect(
        'SUM(CASE WHEN customer.marketingUserId IS NOT NULL AND ' +
          '(customer.createdById IS NULL OR customer.marketingUserId <> customer.createdById) THEN 1 ELSE 0 END)',
        'different',
      )
      .getRawOne();
    return {
      noMarketing: Number(row?.noMarketing) || 0,
      sameCreatorAndMarketing: Number(row?.same) || 0,
      differentCreatorAndMarketing: Number(row?.different) || 0,
    };
  }

  /**
   * Option cho dropdown lọc - lấy từ TOÀN BỘ data trong phạm vi RBAC (không lọc kỳ, không lọc user)
   * để chọn 1 người rồi vẫn còn đủ option của người khác trong dropdown.
   */
  private async loadOptionIds(ctx: Ctx) {
    const base = () => this.baseQb(ctx, false);
    const [marketerRows, creatorRows, sourceRows] = await Promise.all([
      base()
        .select('customer.marketingUserId', 'id')
        .andWhere('customer.marketingUserId IS NOT NULL')
        .groupBy('customer.marketingUserId')
        .getRawMany(),
      base()
        .select('customer.createdById', 'id')
        .andWhere('customer.createdById IS NOT NULL')
        .groupBy('customer.createdById')
        .getRawMany(),
      base().select('customer.source', 'source').groupBy('customer.source').getRawMany(),
    ]);

    const own = this.isOwnOnly(ctx);
    const ids = (rows: any[]) =>
      rows.map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0 && (!own || id === ctx.viewerId));
    return {
      marketerIds: ids(marketerRows),
      creatorIds: ids(creatorRows),
      sources: sourceRows
        .map((r) => String(r.source ?? ''))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'vi')),
    };
  }

  // ═══════════════════════════ HELPERS ═══════════════════════════

  private async loadUsers(ids: number[]): Promise<Map<number, UserInfo>> {
    const map = new Map<number, UserInfo>();
    if (ids.length === 0) return map;
    // withDeleted: nhân viên đã nghỉ/xoá vẫn phải hiện đúng tên trong báo cáo lịch sử.
    const users = await this.userRepo.find({
      where: { id: In(ids) },
      relations: { department: true, position: true },
      withDeleted: true,
    });
    for (const u of users) {
      map.set(u.id, {
        name: u.name,
        departmentId: u.departmentId ?? null,
        departmentName: u.department?.name ?? null,
        departmentColor: u.department?.color ?? null,
        role: u.role ?? null,
        positionName: u.position?.name ?? null,
        positionColor: u.position?.color ?? null,
      });
    }
    return map;
  }

  private buildUserRows(
    metrics: Map<string, MarketingMetrics>,
    statusPivot: Map<string, Record<string, number>>,
    statusCodes: string[],
    users: Map<number, UserInfo>,
    unassignedLabel: string,
    keep: (key: string) => boolean,
  ): MarketingUserRow[] {
    const rows: MarketingUserRow[] = [];
    for (const [key, m] of metrics.entries()) {
      if (!keep(key)) continue;
      const userId = Number(key) || 0;
      const u = userId > 0 ? users.get(userId) : undefined;
      const raw = statusPivot.get(key) ?? {};
      const byStatus: Record<string, number> = Object.fromEntries(statusCodes.map((c) => [c, raw[c] ?? 0]));
      rows.push({
        userId,
        userName: userId === UNASSIGNED_KEY ? unassignedLabel : (u?.name ?? '(Không rõ)'),
        departmentId: u?.departmentId ?? null,
        departmentName: u?.departmentName ?? null,
        departmentColor: u?.departmentColor ?? null,
        ...m,
        byStatus,
      });
    }
    return rows.sort((a, b) => b.revenue - a.revenue || b.totalCustomers - a.totalCustomers);
  }

  /** Danh sách nhãn ngày ('YYYY-MM-DD') hoặc tháng ('YYYY-MM') phủ kín kỳ. */
  private buildBuckets(range: ResolvedReportRange, granularity: 'day' | 'month'): string[] {
    const out: string[] = [];
    const start = new Date(`${range.from.slice(0, 10)}T00:00:00Z`);
    const end = new Date(`${range.to.slice(0, 10)}T00:00:00Z`);
    if (granularity === 'day') {
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        out.push(d.toISOString().slice(0, 10));
      }
    } else {
      for (
        let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
        d <= end;
        d.setUTCMonth(d.getUTCMonth() + 1)
      ) {
        out.push(d.toISOString().slice(0, 7));
      }
    }
    return out;
  }
}
