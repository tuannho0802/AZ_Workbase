import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import { LinkGroup } from '../../database/entities/link-group.entity';
import { LinkCategory } from '../../database/entities/link-category.entity';
import { User } from '../../database/entities/user.entity';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { Role } from '../../common/enums/role.enum';
import { CustomerAccessHelper } from '../customers/helpers/customer-access.helper';
import { QueryGroupQualityReportDto } from './dto/query-group-quality-report.dto';
import {
  ResolvedReportRange,
  resolvePreviousReportRange,
  resolveReportRange,
  spanDaysOf,
} from './report-range.util';

/** Kỳ dài hơn ngưỡng này thì biểu đồ xu hướng gộp theo THÁNG (cùng ngưỡng với báo cáo Marketing). */
export const GROUP_TREND_MONTH_THRESHOLD_DAYS = 92;

/**
 * Bộ số đo CHẤT LƯỢNG của 1 nhóm (hoặc toàn bộ nhóm đang xem). "Thành viên" = khách có
 * `customer_group_memberships.joined = true` (bất kể join lúc nào), trong phạm vi khách người xem được thấy.
 */
export interface GroupQualityMetrics {
  /** Khách đã join nhóm (mọi thời điểm). */
  members: number;
  /** Khách join nhóm TRONG KỲ (`joined_at`, UTC thật -> fromUtc/toUtc). */
  newJoins: number;
  /** Trong số thành viên: đã từng nạp (bất kỳ lúc nào). Luôn ≤ members. */
  depositedMembers: number;
  /** Trong số thành viên: trạng thái hiện tại = 'closed'. Luôn ≤ members. */
  closedMembers: number;
  /** COHORT: trong số khách join TRONG KỲ, đã từng nạp. Luôn ≤ newJoins. */
  newJoinsDeposited: number;
  /** COHORT: trong số khách join TRONG KỲ, đã chốt. Luôn ≤ newJoins. */
  newJoinsClosed: number;
  /** Số thành viên có ≥ 1 khoản nạp trong kỳ (`deposit_date`, cột date -> from/to naive). */
  periodDepositors: number;
  /** Tiền nạp trong kỳ của thành viên (USD). */
  periodRevenue: number;
  /** Tổng tiền nạp MỌI THỜI ĐIỂM của thành viên (USD) - đo giá trị nhóm mang lại. */
  lifetimeRevenue: number;
  /** COHORT: tổng tiền nạp mọi thời điểm CỦA khách join TRONG KỲ (USD) - mẫu số là newJoins (card "Giá trị TB / khách join"). */
  newJoinsLifetimeRevenue: number;
  /** TB số ngày từ lúc join nhóm tới khoản nạp ĐẦU TIÊN (chỉ tính khách nạp SAU/CÙNG NGÀY join). null = chưa có mẫu. */
  avgDaysToFirstDeposit: number | null;
}

export interface GroupUserBrief {
  id: number;
  name: string;
  role: string | null;
  departmentName: string | null;
  departmentColor: string | null;
  positionName: string | null;
  positionColor: string | null;
}

export interface GroupQualityRow extends GroupQualityMetrics {
  groupId: number;
  groupName: string;
  categoryId: number;
  categoryName: string | null;
  categoryColor: string | null;
  isActive: boolean;
  primaryManager: GroupUserBrief | null;
  /** Thành viên theo status hiện tại - đủ mặt mọi status (kể cả 0). */
  byStatus: Record<string, number>;
  /** COHORT: khách JOIN TRONG KỲ theo status hiện tại (đồng bộ Date filter). */
  newJoinsByStatus: Record<string, number>;
}

export interface GroupSourceRow {
  source: string;
  members: number;
  depositedMembers: number;
  closedMembers: number;
  lifetimeRevenue: number;
  /** COHORT (đồng bộ Date filter): khách join trong kỳ / đã nạp / đã chốt. */
  newJoins: number;
  newJoinsDeposited: number;
  newJoinsClosed: number;
}

export interface GroupSalesRow {
  /** 0 = khách chưa có Sales phụ trách. */
  userId: number;
  userName: string;
  role: string | null;
  departmentName: string | null;
  departmentColor: string | null;
  positionName: string | null;
  positionColor: string | null;
  members: number;
  depositedMembers: number;
  closedMembers: number;
  lifetimeRevenue: number;
}

export interface GroupTrendPoint {
  /** 'YYYY-MM-DD' (granularity=day) hoặc 'YYYY-MM' (granularity=month). */
  date: string;
  newJoins: number;
  revenue: number;
  depositors: number;
}

const IN_JOIN = 'membership.joined_at BETWEEN :joinFrom AND :joinTo';

const zeroMetrics = (): GroupQualityMetrics => ({
  members: 0,
  newJoins: 0,
  depositedMembers: 0,
  closedMembers: 0,
  newJoinsDeposited: 0,
  newJoinsClosed: 0,
  periodDepositors: 0,
  periodRevenue: 0,
  lifetimeRevenue: 0,
  newJoinsLifetimeRevenue: 0,
  avgDaysToFirstDeposit: null,
});

interface Ctx {
  viewerId: number;
  viewerRole: string;
  scope?: string | null;
  range: ResolvedReportRange;
  groupId?: number;
  categoryId?: number;
}

const UNASSIGNED_SALES = 0;
const HAS_DEPOSIT = 'EXISTS (SELECT 1 FROM deposits dd WHERE dd.customer_id = customer.id)';
const FIRST_DEPOSIT_JOIN =
  '(SELECT customer_id, MIN(deposit_date) AS first_dep FROM deposits GROUP BY customer_id)';
/** Ngày (giờ VN) khách join nhóm - `joined_at` là UTC thật nên +7h trước khi lấy phần ngày. Dùng TÊN CỘT THẬT (cả 2 nhánh memberQb đều lộ `membership.joined_at`). */
const JOIN_DAY = 'DATE(DATE_ADD(membership.joined_at, INTERVAL 7 HOUR))';

/**
 * BÁO CÁO CHẤT LƯỢNG NHÓM - mỗi nhóm liên kết (link_groups) đang "nuôi" khách tốt tới đâu:
 * bao nhiêu khách join, bao nhiêu đã nạp/đã chốt, doanh thu nhóm mang lại, join xong bao lâu thì nạp,
 * nhóm nào trống/yếu để xử lý.
 *
 * QUY ƯỚC MỖI CHỈ SỐ - mỗi chỉ số dùng cột ngày RIÊNG (cùng quy ước với ReportsMarketingService):
 *  - newJoins / newJoinsDeposited / newJoinsClosed: `membership.joined_at` (UTC thật -> fromUtc/toUtc)
 *  - periodDepositors / periodRevenue: `deposits.deposit_date` (cột date -> from/to naive)
 *  - members / depositedMembers / closedMembers / lifetimeRevenue: KHÔNG lọc ngày (trạng thái hiện tại)
 * => tỷ lệ hợp lệ (≤ 100%) chỉ là: depositedMembers/members, closedMembers/members (cùng tập thành viên)
 *    và newJoinsDeposited/newJoins, newJoinsClosed/newJoins (cùng cohort join trong kỳ).
 *
 * PHÂN QUYỀN: thuần theo `scope` qua CustomerAccessHelper.applyViewFilter (không tự viết lại rule) -
 * scope='own' chỉ thấy phần khách của chính mình trong nhóm. KHÔNG permission key mới (dùng `reports.view`).
 */
@Injectable()
export class ReportsGroupQualityService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(CustomerStatus)
    private readonly customerStatusRepo: Repository<CustomerStatus>,
    @InjectRepository(LinkGroup)
    private readonly groupRepo: Repository<LinkGroup>,
    @InjectRepository(LinkCategory)
    private readonly categoryRepo: Repository<LinkCategory>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // ═══════════════════════════ ENTRY ═══════════════════════════

  async getGroupQualityReport(
    query: QueryGroupQualityReportDto,
    viewerId: number,
    viewerRole: string,
    scope?: string | null,
  ) {
    const range = resolveReportRange(query);
    const prevRange = resolvePreviousReportRange(query);
    const spanDays = spanDaysOf(range);
    const granularity: 'day' | 'month' = spanDays > GROUP_TREND_MONTH_THRESHOLD_DAYS ? 'month' : 'day';

    const ctx: Ctx = { viewerId, viewerRole, scope, range, groupId: query.groupId, categoryId: query.categoryId };
    const prevCtx: Ctx = { ...ctx, range: prevRange };

    const [statuses, allGroups, categories] = await Promise.all([
      this.customerStatusRepo.find({ order: { sortOrder: 'ASC', id: 'ASC' } }),
      this.groupRepo.find({
        relations: { category: true, primaryManager: true },
        order: { sortOrder: 'ASC', id: 'ASC' },
      }),
      this.categoryRepo.find({ order: { sortOrder: 'ASC', id: 'ASC' } }),
    ]);
    const statusCodes = statuses.map((s) => s.code);

    // Nhóm nằm trong bộ lọc (dropdown "Nhóm" luôn liệt kê ĐỦ nhóm của Category đang chọn, không co lại theo groupId).
    const inCategory = (g: LinkGroup) => !query.categoryId || g.categoryId === query.categoryId;
    const selectedGroups = allGroups.filter((g) => inCategory(g) && (!query.groupId || g.id === query.groupId));

    const [perGroup, overall, prevOverall, statusPivot, newStatusPivot, bySource, bySalesRaw, trend, noGroup] = await Promise.all([
      this.collectMetrics(ctx, true),
      this.collectMetrics(ctx, false),
      this.collectMetrics(prevCtx, false),
      this.collectStatusPivot(ctx),
      this.collectStatusPivot(ctx, true),
      this.collectBySource(ctx),
      this.collectBySales(ctx),
      this.collectTrend(ctx, granularity),
      this.collectNoGroup(ctx),
    ]);

    const managerIds = selectedGroups.map((g) => g.primaryManagerId).filter((id): id is number => !!id);
    const salesIds = bySalesRaw.map((r) => r.userId).filter((id) => id > 0);
    const users = await this.loadUsers([...new Set([...managerIds, ...salesIds])]);

    const groups: GroupQualityRow[] = selectedGroups.map((g) => {
      const raw = statusPivot.get(String(g.id)) ?? {};
      const rawNew = newStatusPivot.get(String(g.id)) ?? {};
      return {
        groupId: g.id,
        groupName: g.name,
        categoryId: g.categoryId,
        categoryName: g.category?.name ?? null,
        categoryColor: g.category?.color ?? null,
        isActive: g.isActive,
        primaryManager: g.primaryManagerId ? (users.get(g.primaryManagerId) ?? null) : null,
        ...(perGroup.get(String(g.id)) ?? zeroMetrics()),
        byStatus: Object.fromEntries(statusCodes.map((c) => [c, raw[c] ?? 0])),
        newJoinsByStatus: Object.fromEntries(statusCodes.map((c) => [c, rawNew[c] ?? 0])),
      };
    });

    const current = overall.get('_all') ?? zeroMetrics();
    const previous = prevOverall.get('_all') ?? zeroMetrics();

    const totalByStatus: Record<string, number> = Object.fromEntries(statusCodes.map((c) => [c, 0]));
    for (const g of groups) for (const [c, n] of Object.entries(g.byStatus)) if (c in totalByStatus) totalByStatus[c] += n;

    return {
      period: { type: query.period, from: range.from, to: range.to, granularity, spanDays },
      previousPeriod: { from: prevRange.from, to: prevRange.to },
      appliedFilters: { groupId: query.groupId, categoryId: query.categoryId },
      ownOnly: this.isOwnOnly(ctx),
      options: {
        groups: allGroups.filter(inCategory).map((g) => ({
          id: g.id,
          name: g.name,
          categoryId: g.categoryId,
          categoryName: g.category?.name ?? null,
          categoryColor: g.category?.color ?? null,
          isActive: g.isActive,
        })),
        categories: categories.map((c) => ({ id: c.id, name: c.name, color: c.color })),
      },
      statuses: statuses.map((s) => ({ code: s.code, name: s.name, color: s.color })),
      summary: {
        current,
        previous: {
          newJoins: previous.newJoins,
          periodRevenue: previous.periodRevenue,
          periodDepositors: previous.periodDepositors,
        },
        groupCount: groups.length,
        emptyGroups: groups.filter((g) => g.members === 0).length,
        newCustomers: noGroup.newCustomers,
        newCustomersNoGroup: noGroup.newCustomersNoGroup,
        totalByStatus,
      },
      groups,
      bySource,
      bySales: bySalesRaw
        .map((r) => {
          const u = users.get(r.userId);
          return {
            ...r,
            userName: r.userId === UNASSIGNED_SALES ? '(Chưa có Sales)' : (u?.name ?? '(Không rõ)'),
            role: u?.role ?? null,
            departmentName: u?.departmentName ?? null,
            departmentColor: u?.departmentColor ?? null,
            positionName: u?.positionName ?? null,
            positionColor: u?.positionColor ?? null,
          } as GroupSalesRow;
        })
        .sort((a, b) => b.lifetimeRevenue - a.lifetimeRevenue || b.members - a.members),
      trend,
    };
  }

  // ═══════════════════════════ QUERY BUILDING BLOCKS ═══════════════════════════

  private isOwnOnly(ctx: Ctx): boolean {
    return ctx.scope === PermissionScope.OWN && ctx.viewerRole !== Role.ADMIN;
  }

  /**
   * Khách người xem được thấy (RBAC = CustomerAccessHelper) đã JOIN các thành viên nhóm (joined=true) + lọc nhóm/Category.
   *
   * `perGroup=true`: join THẲNG bảng membership (1 dòng / (khách, nhóm)) - chỉ dùng khi GROUP BY nhóm.
   * `perGroup=false`: join bảng dẫn xuất THU GỌN về 1 dòng / khách (joined_at = lần join SỚM NHẤT trong các nhóm đang xem).
   * ⚠️ BẮT BUỘC cho mọi truy vấn KHÔNG group theo nhóm: khách ở 2 nhóm mà join thẳng sẽ nhân đôi dòng nạp
   * -> SUM(deposit.amount) bị đếm gấp đôi. Cả 2 nhánh đều lộ cột `membership.joined_at` (dùng tên cột thật, không dùng property).
   */
  private memberQb(ctx: Ctx, perGroup = false): SelectQueryBuilder<Customer> {
    const qb = this.customerRepo.createQueryBuilder('customer');
    CustomerAccessHelper.applyViewFilter(qb, ctx.viewerId, ctx.viewerRole, ctx.scope);

    if (perGroup) {
      qb.innerJoin(
        CustomerGroupMembership,
        'membership',
        'membership.customer_id = customer.id AND membership.joined = true',
      );
      qb.innerJoin(LinkGroup, 'lg', 'lg.id = membership.group_id');
      if (ctx.groupId) qb.andWhere('lg.id = :fGroup', { fGroup: ctx.groupId });
      if (ctx.categoryId) qb.andWhere('lg.category_id = :fCategory', { fCategory: ctx.categoryId });
      return qb;
    }

    const conds = ['m.joined = true'];
    const params: Record<string, number> = {};
    if (ctx.groupId) {
      conds.push('g.id = :fGroup');
      params.fGroup = ctx.groupId;
    }
    if (ctx.categoryId) {
      conds.push('g.category_id = :fCategory');
      params.fCategory = ctx.categoryId;
    }
    return qb.innerJoin(
      `(SELECT m.customer_id AS customer_id, MIN(m.joined_at) AS joined_at FROM customer_group_memberships m INNER JOIN link_groups g ON g.id = m.group_id WHERE ${conds.join(' AND ')} GROUP BY m.customer_id)`,
      'membership',
      'membership.customer_id = customer.id',
      params,
    );
  }

  /**
   * 1 query tổng hợp cho toàn bộ chỉ số (nhóm theo group, hoặc 1 dòng tổng '_all').
   * `byGroup=false` dùng COUNT(DISTINCT customer.id) nên khách ở nhiều nhóm chỉ được đếm 1 lần ở dòng tổng.
   */
  private async collectMetrics(ctx: Ctx, byGroup: boolean): Promise<Map<string, GroupQualityMetrics>> {
    const { range } = ctx;
    const inPeriod = 'membership.joined_at BETWEEN :joinFrom AND :joinTo';
    const inDeposit = 'deposit.depositDate BETWEEN :depFrom AND :depTo';

    const qb = this.memberQb(ctx, byGroup)
      .leftJoin('customer.deposits', 'deposit')
      .leftJoin(FIRST_DEPOSIT_JOIN, 'fd', 'fd.customer_id = customer.id');
    if (byGroup) qb.select('membership.group_id', 'k').groupBy('membership.group_id');
    else qb.select('1', '_dummy');

    // ⚠️ leftJoin deposits nhân bản dòng khách theo số khoản nạp -> MỌI số đếm khách phải DISTINCT customer.id,
    // còn tiền SUM(deposit.amount) thì mỗi khoản nạp đúng 1 dòng nên không bị nhân đôi.
    const rows = await qb
      .addSelect('COUNT(DISTINCT customer.id)', 'members')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${inPeriod} THEN customer.id END)`, 'newJoins')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${HAS_DEPOSIT} THEN customer.id END)`, 'depositedMembers')
      .addSelect("COUNT(DISTINCT CASE WHEN customer.status = 'closed' THEN customer.id END)", 'closedMembers')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${inPeriod} AND ${HAS_DEPOSIT} THEN customer.id END)`, 'newJoinsDeposited')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${inPeriod} AND customer.status = 'closed' THEN customer.id END)`, 'newJoinsClosed')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${inDeposit} THEN customer.id END)`, 'periodDepositors')
      .addSelect(`SUM(CASE WHEN ${inDeposit} THEN deposit.amount ELSE 0 END)`, 'periodRevenue')
      .addSelect('SUM(deposit.amount)', 'lifetimeRevenue')
      .addSelect(`SUM(CASE WHEN ${inPeriod} THEN deposit.amount ELSE 0 END)`, 'newJoinsLifetimeRevenue')
      .addSelect(
        `AVG(CASE WHEN fd.first_dep IS NOT NULL AND fd.first_dep >= ${JOIN_DAY} THEN DATEDIFF(fd.first_dep, ${JOIN_DAY}) END)`,
        'avgDays',
      )
      .setParameters({
        joinFrom: range.fromUtc,
        joinTo: range.toUtc,
        depFrom: range.from,
        depTo: range.to,
      })
      .getRawMany();

    const map = new Map<string, GroupQualityMetrics>();
    for (const r of rows) {
      map.set(byGroup ? String(r.k) : '_all', {
        members: Number(r.members) || 0,
        newJoins: Number(r.newJoins) || 0,
        depositedMembers: Number(r.depositedMembers) || 0,
        closedMembers: Number(r.closedMembers) || 0,
        newJoinsDeposited: Number(r.newJoinsDeposited) || 0,
        newJoinsClosed: Number(r.newJoinsClosed) || 0,
        periodDepositors: Number(r.periodDepositors) || 0,
        periodRevenue: Number(r.periodRevenue) || 0,
        lifetimeRevenue: Number(r.lifetimeRevenue) || 0,
        newJoinsLifetimeRevenue: Number(r.newJoinsLifetimeRevenue) || 0,
        avgDaysToFirstDeposit: r.avgDays == null ? null : Math.round(Number(r.avgDays) * 10) / 10,
      });
    }
    if (!byGroup && !map.has('_all')) map.set('_all', zeroMetrics());
    return map;
  }

  /** Thành viên chia theo (nhóm, status hiện tại). */
  private async collectStatusPivot(ctx: Ctx, cohortOnly = false): Promise<Map<string, Record<string, number>>> {
    const qb = this.memberQb(ctx, true);
    // cohortOnly: chỉ khách JOIN TRONG KỲ -> biểu đồ cơ cấu trạng thái đồng bộ Date filter.
    if (cohortOnly) qb.andWhere('membership.joined_at BETWEEN :joinFrom AND :joinTo', { joinFrom: ctx.range.fromUtc, joinTo: ctx.range.toUtc });
    const rows = await qb
      .select('membership.group_id', 'k')
      .addSelect('customer.status', 'status')
      .addSelect('COUNT(DISTINCT customer.id)', 'cnt')
      .groupBy('membership.group_id')
      .addGroupBy('customer.status')
      .getRawMany();

    const map = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const key = String(r.k);
      const entry = map.get(key) ?? {};
      entry[String(r.status)] = (entry[String(r.status)] ?? 0) + (Number(r.cnt) || 0);
      map.set(key, entry);
    }
    return map;
  }

  /** Thành viên theo NGUỒN khách (nguồn nào đem về khách "nuôi" nhóm tốt). */
  private async collectBySource(ctx: Ctx): Promise<GroupSourceRow[]> {
    const rows = await this.memberQb(ctx)
      .leftJoin('customer.deposits', 'deposit')
      .select('customer.source', 'k')
      .addSelect('COUNT(DISTINCT customer.id)', 'members')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${HAS_DEPOSIT} THEN customer.id END)`, 'depositedMembers')
      .addSelect("COUNT(DISTINCT CASE WHEN customer.status = 'closed' THEN customer.id END)", 'closedMembers')
      .addSelect('SUM(deposit.amount)', 'lifetimeRevenue')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${IN_JOIN} THEN customer.id END)`, 'newJoins')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${IN_JOIN} AND ${HAS_DEPOSIT} THEN customer.id END)`, 'newJoinsDeposited')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${IN_JOIN} AND customer.status = 'closed' THEN customer.id END)`, 'newJoinsClosed')
      .groupBy('customer.source')
      .setParameters({ joinFrom: ctx.range.fromUtc, joinTo: ctx.range.toUtc })
      .getRawMany();

    return rows
      .map((r) => ({
        source: r.k ? String(r.k) : '(Không rõ)',
        members: Number(r.members) || 0,
        depositedMembers: Number(r.depositedMembers) || 0,
        closedMembers: Number(r.closedMembers) || 0,
        lifetimeRevenue: Number(r.lifetimeRevenue) || 0,
        newJoins: Number(r.newJoins) || 0,
        newJoinsDeposited: Number(r.newJoinsDeposited) || 0,
        newJoinsClosed: Number(r.newJoinsClosed) || 0,
      }))
      .sort((a, b) => b.newJoins - a.newJoins || b.members - a.members);
  }

  /** Thành viên theo SALES phụ trách - Sales nào chăm khách trong nhóm hiệu quả. */
  private async collectBySales(
    ctx: Ctx,
  ): Promise<Pick<GroupSalesRow, 'userId' | 'members' | 'depositedMembers' | 'closedMembers' | 'lifetimeRevenue'>[]> {
    const rows = await this.memberQb(ctx)
      .leftJoin('customer.deposits', 'deposit')
      .select('IFNULL(customer.salesUserId, 0)', 'k')
      .addSelect('COUNT(DISTINCT customer.id)', 'members')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${HAS_DEPOSIT} THEN customer.id END)`, 'depositedMembers')
      .addSelect("COUNT(DISTINCT CASE WHEN customer.status = 'closed' THEN customer.id END)", 'closedMembers')
      .addSelect('SUM(deposit.amount)', 'lifetimeRevenue')
      .groupBy('IFNULL(customer.salesUserId, 0)')
      .getRawMany();

    return rows.map((r) => ({
      userId: Number(r.k) || 0,
      members: Number(r.members) || 0,
      depositedMembers: Number(r.depositedMembers) || 0,
      closedMembers: Number(r.closedMembers) || 0,
      lifetimeRevenue: Number(r.lifetimeRevenue) || 0,
    }));
  }

  /** Xu hướng join nhóm + tiền nạp của thành viên trong kỳ, ĐÃ ĐIỀN 0 cho ngày/tháng trống. */
  private async collectTrend(ctx: Ctx, granularity: 'day' | 'month'): Promise<GroupTrendPoint[]> {
    const { range } = ctx;
    const f = granularity === 'month' ? '%Y-%m' : '%Y-%m-%d';
    const joinBucket = `DATE_FORMAT(DATE_ADD(membership.joined_at, INTERVAL 7 HOUR), '${f}')`;
    const depositBucket = `DATE_FORMAT(deposit.depositDate, '${f}')`;

    const [joinRows, depositRows] = await Promise.all([
      this.memberQb(ctx)
        .andWhere('membership.joined_at BETWEEN :joinFrom AND :joinTo', { joinFrom: range.fromUtc, joinTo: range.toUtc })
        .select(joinBucket, 'b')
        .addSelect('COUNT(DISTINCT customer.id)', 'n')
        .groupBy(joinBucket)
        .getRawMany(),
      this.memberQb(ctx)
        .innerJoin('customer.deposits', 'deposit')
        .andWhere('deposit.depositDate BETWEEN :depFrom AND :depTo', { depFrom: range.from, depTo: range.to })
        .select(depositBucket, 'b')
        .addSelect('SUM(deposit.amount)', 'revenue')
        .addSelect('COUNT(DISTINCT customer.id)', 'depositors')
        .groupBy(depositBucket)
        .getRawMany(),
    ]);

    const points = new Map<string, GroupTrendPoint>();
    for (const b of this.buildBuckets(range, granularity)) points.set(b, { date: b, newJoins: 0, revenue: 0, depositors: 0 });
    for (const r of joinRows) {
      const p = points.get(String(r.b));
      if (p) p.newJoins = Number(r.n) || 0;
    }
    for (const r of depositRows) {
      const p = points.get(String(r.b));
      if (p) {
        p.revenue = Number(r.revenue) || 0;
        p.depositors = Number(r.depositors) || 0;
      }
    }
    return [...points.values()];
  }

  /**
   * Data MỚI trong kỳ (theo ngày tạo) và bao nhiêu khách CHƯA join nhóm nào - tín hiệu "khách rơi ra khỏi phễu nhóm".
   * Không lọc theo nhóm/Category (khách chưa join nhóm nào thì không thuộc nhóm nào để lọc).
   */
  private async collectNoGroup(ctx: Ctx): Promise<{ newCustomers: number; newCustomersNoGroup: number }> {
    const qb = this.customerRepo.createQueryBuilder('customer');
    CustomerAccessHelper.applyViewFilter(qb, ctx.viewerId, ctx.viewerRole, ctx.scope);
    const row = await qb
      .andWhere('customer.createdAt BETWEEN :createdFrom AND :createdTo', {
        createdFrom: ctx.range.fromUtc,
        createdTo: ctx.range.toUtc,
      })
      .select('COUNT(*)', 'total')
      .addSelect(
        'SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM customer_group_memberships cgm WHERE cgm.customer_id = customer.id AND cgm.joined = true) THEN 1 ELSE 0 END)',
        'noGroup',
      )
      .getRawOne();
    return { newCustomers: Number(row?.total) || 0, newCustomersNoGroup: Number(row?.noGroup) || 0 };
  }

  // ═══════════════════════════ HELPERS ═══════════════════════════

  private async loadUsers(ids: number[]): Promise<Map<number, GroupUserBrief>> {
    const map = new Map<number, GroupUserBrief>();
    if (ids.length === 0) return map;
    // withDeleted: nhân viên đã nghỉ vẫn hiện đúng tên trong báo cáo lịch sử.
    const users = await this.userRepo.find({
      where: { id: In(ids) },
      relations: { department: true, position: true },
      withDeleted: true,
    });
    for (const u of users) {
      map.set(u.id, {
        id: u.id,
        name: u.name,
        role: u.role ?? null,
        departmentName: u.department?.name ?? null,
        departmentColor: u.department?.color ?? null,
        positionName: u.position?.name ?? null,
        positionColor: u.position?.color ?? null,
      });
    }
    return map;
  }

  /** Danh sách nhãn ngày ('YYYY-MM-DD') hoặc tháng ('YYYY-MM') phủ kín kỳ. */
  private buildBuckets(range: ResolvedReportRange, granularity: 'day' | 'month'): string[] {
    const out: string[] = [];
    const start = new Date(`${range.from.slice(0, 10)}T00:00:00Z`);
    const end = new Date(`${range.to.slice(0, 10)}T00:00:00Z`);
    if (granularity === 'day') {
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
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
