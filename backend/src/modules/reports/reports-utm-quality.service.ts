import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import { Utm } from '../../database/entities/utm.entity';
import { User } from '../../database/entities/user.entity';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { Role } from '../../common/enums/role.enum';
import { CustomerAccessHelper } from '../customers/helpers/customer-access.helper';
import { QueryUtmQualityReportDto, UtmQualityState } from './dto/query-utm-quality-report.dto';
import { ResolvedReportRange, resolvePreviousReportRange, resolveReportRange, spanDaysOf } from './report-range.util';

/** Kỳ dài hơn ngưỡng này thì biểu đồ xu hướng gộp theo THÁNG (cùng ngưỡng với báo cáo Marketing/Nhóm). */
export const UTM_TREND_MONTH_THRESHOLD_DAYS = 92;
/** Số Sales / Marketing tối đa liệt kê kèm MỖI UTM (bảng chi tiết); tổng số người thật vẫn trả riêng. */
export const UTM_PARTICIPANTS_TOP = 5;

/**
 * Bộ số đo CHẤT LƯỢNG của 1 UTM (hoặc nhiều UTM cộng lại). "Khách của UTM" = khách có `customers.utm_id` = UTM đó
 * (trong phạm vi khách người xem được thấy). 1 khách chỉ có 1 UTM nên CỘNG các dòng UTM lại luôn ra đúng tổng
 * (không bị đếm đôi như báo cáo nhóm).
 */
export interface UtmQualityMetrics {
  /** Khách đang gắn UTM (mọi thời điểm). */
  customers: number;
  /** Khách MỚI trong kỳ (`customers.created_at`, UTC thật -> fromUtc/toUtc). */
  newCustomers: number;
  /** Trong số khách của UTM: đã từng nạp (bất kỳ lúc nào). Luôn ≤ customers. */
  depositedCustomers: number;
  /** Trong số khách của UTM: trạng thái hiện tại = 'closed'. Luôn ≤ customers. */
  closedCustomers: number;
  /** COHORT: trong số khách MỚI trong kỳ, đã từng nạp. Luôn ≤ newCustomers. */
  newDeposited: number;
  /** COHORT: trong số khách MỚI trong kỳ, đã chốt. Luôn ≤ newCustomers. */
  newClosed: number;
  /** Số khách có ≥ 1 khoản nạp trong kỳ (`deposit_date`, cột date -> from/to naive). */
  periodDepositors: number;
  /** Tiền nạp trong kỳ (USD). */
  periodRevenue: number;
  /** Tổng tiền nạp MỌI THỜI ĐIỂM (USD) - giá trị UTM mang lại. */
  lifetimeRevenue: number;
  /** COHORT: tổng tiền nạp mọi thời điểm CỦA khách MỚI trong kỳ (USD) - mẫu số là newCustomers (card "Giá trị TB / khách"). */
  newLifetimeRevenue: number;
  /** Tổng số khoản nạp mọi thời điểm (lịch sử nạp). */
  depositCount: number;
  /** Khách nạp từ 2 lần trở lên (nạp lại) - khách "giữ chân" tốt. Luôn ≤ depositedCustomers. */
  redepositors: number;
  /** TB số ngày từ lúc khách vào hệ thống tới khoản nạp ĐẦU TIÊN (chỉ khách nạp SAU/CÙNG NGÀY nhập). null = chưa có mẫu. */
  avgDaysToFirstDeposit: number | null;
  /** Số khách làm mẫu cho `avgDaysToFirstDeposit` (dùng để cộng gộp có trọng số). */
  avgDaysSamples: number;
}

export interface UtmUserBrief {
  id: number;
  name: string;
  role: string | null;
  departmentName: string | null;
  departmentColor: string | null;
  positionName: string | null;
  positionColor: string | null;
}

/** 1 Sales / Marketing tham gia trong 1 UTM (bảng chi tiết). */
export interface UtmParticipant {
  /** 0 = khách chưa gán người phụ trách. */
  userId: number;
  user: UtmUserBrief | null;
  customers: number;
  depositedCustomers: number;
  closedCustomers: number;
  lifetimeRevenue: number;
}

export interface UtmParticipants {
  /** Tổng số người khác nhau (kể cả "chưa gán") tham gia UTM này. */
  total: number;
  top: UtmParticipant[];
}

export interface UtmQualityRow extends UtmQualityMetrics {
  utmId: number;
  utmName: string;
  color: string;
  description: string | null;
  visibility: 'shared' | 'restricted';
  isActive: boolean;
  lockedAt: Date | null;
  primaryManager: UtmUserBrief | null;
  secondaryManagers: UtmUserBrief[];
  /** Khách theo status hiện tại - đủ mặt mọi status (kể cả 0). */
  byStatus: Record<string, number>;
  sales: UtmParticipants;
  marketing: UtmParticipants;
}

export interface UtmSourceRow {
  source: string;
  customers: number;
  depositedCustomers: number;
  closedCustomers: number;
  lifetimeRevenue: number;
}

export interface UtmPersonRow {
  /** 0 = khách chưa gán Sales/Marketing. */
  userId: number;
  userName: string;
  role: string | null;
  departmentName: string | null;
  departmentColor: string | null;
  positionName: string | null;
  positionColor: string | null;
  customers: number;
  newCustomers: number;
  depositedCustomers: number;
  closedCustomers: number;
  periodRevenue: number;
  lifetimeRevenue: number;
  /** Số UTM khác nhau người này đang tham gia. */
  utmCount: number;
}

export interface UtmTrendPoint {
  /** 'YYYY-MM-DD' (granularity=day) hoặc 'YYYY-MM' (granularity=month). */
  date: string;
  newCustomers: number;
  revenue: number;
  depositors: number;
}

const zeroMetrics = (): UtmQualityMetrics => ({
  customers: 0,
  newCustomers: 0,
  depositedCustomers: 0,
  closedCustomers: 0,
  newDeposited: 0,
  newClosed: 0,
  periodDepositors: 0,
  periodRevenue: 0,
  lifetimeRevenue: 0,
  newLifetimeRevenue: 0,
  depositCount: 0,
  redepositors: 0,
  avgDaysToFirstDeposit: null,
  avgDaysSamples: 0,
});

/** Cộng gộp nhiều bộ số đo (TB số ngày tính có trọng số theo số mẫu). */
export function sumUtmMetrics(list: UtmQualityMetrics[]): UtmQualityMetrics {
  const out = zeroMetrics();
  let daysWeighted = 0;
  for (const m of list) {
    out.customers += m.customers;
    out.newCustomers += m.newCustomers;
    out.depositedCustomers += m.depositedCustomers;
    out.closedCustomers += m.closedCustomers;
    out.newDeposited += m.newDeposited;
    out.newClosed += m.newClosed;
    out.periodDepositors += m.periodDepositors;
    out.periodRevenue += m.periodRevenue;
    out.lifetimeRevenue += m.lifetimeRevenue;
    out.newLifetimeRevenue += m.newLifetimeRevenue;
    out.depositCount += m.depositCount;
    out.redepositors += m.redepositors;
    if (m.avgDaysToFirstDeposit != null && m.avgDaysSamples > 0) {
      daysWeighted += m.avgDaysToFirstDeposit * m.avgDaysSamples;
      out.avgDaysSamples += m.avgDaysSamples;
    }
  }
  out.avgDaysToFirstDeposit = out.avgDaysSamples > 0 ? Math.round((daysWeighted / out.avgDaysSamples) * 10) / 10 : null;
  return out;
}

interface Ctx {
  viewerId: number;
  viewerRole: string;
  scope?: string | null;
  range: ResolvedReportRange;
  state: UtmQualityState;
  utmId?: number;
  salesUserId?: number;
  marketingUserId?: number;
}

type PersonColumn = 'salesUserId' | 'marketingUserId';

const NO_PERSON = 0;
const HAS_DEPOSIT = 'EXISTS (SELECT 1 FROM deposits dd WHERE dd.customer_id = customer.id)';
const HAS_REDEPOSIT = '(SELECT COUNT(*) FROM deposits d3 WHERE d3.customer_id = customer.id) >= 2';
const FIRST_DEPOSIT_JOIN = '(SELECT customer_id, MIN(deposit_date) AS first_dep FROM deposits GROUP BY customer_id)';
/** Ngày (giờ VN) khách được tạo - `created_at` là UTC thật nên +7h trước khi lấy phần ngày. */
const CREATED_DAY = 'DATE(DATE_ADD(customer.createdAt, INTERVAL 7 HOUR))';
const IN_CREATED = 'customer.createdAt BETWEEN :cFrom AND :cTo';
const IN_DEPOSIT = 'deposit.depositDate BETWEEN :depFrom AND :depTo';

/**
 * BÁO CÁO CHẤT LƯỢNG UTM - mỗi UTM (nguồn/chiến dịch) đem về khách tốt tới đâu: bao nhiêu khách, đã nạp/đã chốt,
 * doanh thu + lịch sử nạp, nạp lại, vào hệ thống bao lâu thì nạp; kèm SALES chăm khách và MARKETING phụ trách
 * (theo khách) cùng Quản lý chính/phụ của UTM. Chia 3 góc nhìn qua `state`: Tất cả / Hoạt động / Đã khoá.
 *
 * QUY ƯỚC MỖI CHỈ SỐ - mỗi chỉ số dùng cột ngày RIÊNG (cùng quy ước Marketing/Nhóm):
 *  - newCustomers / newDeposited / newClosed: `customers.created_at` (UTC thật -> fromUtc/toUtc)
 *  - periodDepositors / periodRevenue: `deposits.deposit_date` (cột date -> from/to naive)
 *  - customers / depositedCustomers / closedCustomers / lifetimeRevenue / depositCount / redepositors: KHÔNG lọc ngày
 * => tỷ lệ hợp lệ (≤ 100%) chỉ là depositedCustomers/customers, closedCustomers/customers (cùng tập khách) và
 *    newDeposited/newCustomers, newClosed/newCustomers (cùng cohort khách mới trong kỳ).
 *
 * PHÂN QUYỀN: thuần theo `scope` qua CustomerAccessHelper.applyViewFilter (không tự viết lại rule) - dùng `reports.view`,
 * KHÔNG permission key mới. Quyền QUẢN LÝ UTM không mở rộng quyền xem khách (PLAN_UTM_MANAGEMENT 6.2): UTM `restricted`
 * chỉ hiện với người xem nếu là Admin/scope=all, là Quản lý chính/phụ, hoặc có ít nhất 1 khách của UTM đó trong tầm nhìn.
 */
@Injectable()
export class ReportsUtmQualityService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(CustomerStatus)
    private readonly customerStatusRepo: Repository<CustomerStatus>,
    @InjectRepository(Utm)
    private readonly utmRepo: Repository<Utm>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // ═══════════════════════════ ENTRY ═══════════════════════════

  async getUtmQualityReport(query: QueryUtmQualityReportDto, viewerId: number, viewerRole: string, scope?: string | null) {
    const range = resolveReportRange(query);
    const prevRange = resolvePreviousReportRange(query);
    const spanDays = spanDaysOf(range);
    const granularity: 'day' | 'month' = spanDays > UTM_TREND_MONTH_THRESHOLD_DAYS ? 'month' : 'day';

    const ctx: Ctx = {
      viewerId,
      viewerRole,
      scope,
      range,
      state: query.state ?? 'all',
      utmId: query.utmId,
      salesUserId: query.salesUserId,
      marketingUserId: query.marketingUserId,
    };
    const prevCtx: Ctx = { ...ctx, range: prevRange };

    const [statuses, allUtms] = await Promise.all([
      this.customerStatusRepo.find({ order: { sortOrder: 'ASC', id: 'ASC' } }),
      this.utmRepo.find({ relations: { secondaryManagers: true }, order: { sortOrder: 'ASC', id: 'ASC' } }),
    ]);
    const statusCodes = statuses.map((s) => s.code);

    // Số liệu TỪNG UTM (không lọc state/utmId - lọc ở bước chọn dòng để đếm được cả 3 góc nhìn từ 1 lần query).
    const [metrics, statusPivot, salesByUtm, marketingByUtm] = await Promise.all([
      this.collectMetrics(ctx),
      this.collectStatusPivot(ctx),
      this.collectParticipants(ctx, 'salesUserId'),
      this.collectParticipants(ctx, 'marketingUserId'),
    ]);

    const seeAll = viewerRole === Role.ADMIN || scope === PermissionScope.ALL;
    const visible = allUtms.filter((u) => this.isUtmVisible(u, metrics.get(u.id), viewerId, seeAll));
    const matchesState = (u: Utm) => ctx.state === 'all' || (ctx.state === 'active' ? !!u.isActive : !u.isActive);
    const inState = visible.filter(matchesState);
    const selected = ctx.utmId ? inState.filter((u) => u.id === ctx.utmId) : inState;

    const [overallSource, overallSales, overallMarketing, trend, totals, prevTotals, noUtm] = await Promise.all([
      this.collectBySource(ctx),
      this.collectByPerson(ctx, 'salesUserId'),
      this.collectByPerson(ctx, 'marketingUserId'),
      this.collectTrend(ctx, granularity),
      this.collectPeriodTotals(ctx),
      this.collectPeriodTotals(prevCtx),
      this.collectNoUtm(ctx),
    ]);

    const userIds = new Set<number>();
    for (const u of selected) {
      if (u.primaryManagerId) userIds.add(u.primaryManagerId);
      for (const m of u.secondaryManagers ?? []) userIds.add(m.userId);
    }
    for (const r of [...overallSales, ...overallMarketing]) if (r.userId > 0) userIds.add(r.userId);
    for (const id of [query.salesUserId, query.marketingUserId]) if (id && id > 0) userIds.add(id);
    const selectedIds = new Set(selected.map((u) => u.id));
    for (const map of [salesByUtm, marketingByUtm])
      for (const [utmId, list] of map) if (selectedIds.has(utmId)) for (const p of list) if (p.userId > 0) userIds.add(p.userId);
    const users = await this.loadUsers([...userIds]);

    const participants = (list: Omit<UtmParticipant, 'user'>[] | undefined): UtmParticipants => {
      const sorted = [...(list ?? [])].sort((a, b) => b.lifetimeRevenue - a.lifetimeRevenue || b.customers - a.customers);
      return {
        total: sorted.length,
        top: sorted.slice(0, UTM_PARTICIPANTS_TOP).map((p) => ({ ...p, user: p.userId > 0 ? (users.get(p.userId) ?? null) : null })),
      };
    };

    const utms: UtmQualityRow[] = selected.map((u) => {
      const raw = statusPivot.get(u.id) ?? {};
      return {
        utmId: u.id,
        utmName: u.name,
        color: u.color,
        description: u.description ?? null,
        visibility: u.visibility,
        isActive: !!u.isActive,
        lockedAt: u.isActive ? null : (u.lockedAt ?? null),
        primaryManager: u.primaryManagerId ? (users.get(u.primaryManagerId) ?? null) : null,
        secondaryManagers: (u.secondaryManagers ?? []).map((m) => users.get(m.userId)).filter((x): x is UtmUserBrief => !!x),
        ...(metrics.get(u.id) ?? zeroMetrics()),
        byStatus: Object.fromEntries(statusCodes.map((c) => [c, raw[c] ?? 0])),
        sales: participants(salesByUtm.get(u.id)),
        marketing: participants(marketingByUtm.get(u.id)),
      };
    });

    const current = sumUtmMetrics(utms);
    const totalByStatus: Record<string, number> = Object.fromEntries(statusCodes.map((c) => [c, 0]));
    for (const r of utms) for (const [c, n] of Object.entries(r.byStatus)) if (c in totalByStatus) totalByStatus[c] += n;

    const splitOf = (active: boolean) => {
      const list = visible.filter((u) => !!u.isActive === active);
      return { utmCount: list.length, ...sumUtmMetrics(list.map((u) => metrics.get(u.id) ?? zeroMetrics())) };
    };

    const personRow = (r: Omit<UtmPersonRow, 'userName' | 'role' | 'departmentName' | 'departmentColor' | 'positionName' | 'positionColor'>, emptyLabel: string): UtmPersonRow => {
      const u = users.get(r.userId);
      return {
        ...r,
        userName: r.userId === NO_PERSON ? emptyLabel : (u?.name ?? '(Không rõ)'),
        role: u?.role ?? null,
        departmentName: u?.departmentName ?? null,
        departmentColor: u?.departmentColor ?? null,
        positionName: u?.positionName ?? null,
        positionColor: u?.positionColor ?? null,
      };
    };
    const byRevenue = (a: UtmPersonRow, b: UtmPersonRow) => b.lifetimeRevenue - a.lifetimeRevenue || b.customers - a.customers;

    return {
      period: { type: query.period, from: range.from, to: range.to, granularity, spanDays },
      previousPeriod: { from: prevRange.from, to: prevRange.to },
      appliedFilters: {
        state: ctx.state,
        utmId: query.utmId,
        salesUserId: query.salesUserId,
        marketingUserId: query.marketingUserId,
        salesUser: query.salesUserId ? (users.get(query.salesUserId) ?? null) : null,
        marketingUser: query.marketingUserId ? (users.get(query.marketingUserId) ?? null) : null,
      },
      ownOnly: this.isOwnOnly(ctx),
      // Dropdown "UTM" luôn liệt kê ĐỦ UTM của góc nhìn đang chọn (không co lại theo utmId).
      options: { utms: inState.map((u) => ({ id: u.id, name: u.name, color: u.color, isActive: !!u.isActive })) },
      statuses: statuses.map((s) => ({ code: s.code, name: s.name, color: s.color })),
      summary: {
        current,
        previous: { newCustomers: prevTotals.newCustomers, periodRevenue: prevTotals.periodRevenue, periodDepositors: prevTotals.periodDepositors },
        utmCount: utms.length,
        emptyUtms: utms.filter((u) => u.customers === 0).length,
        stateCounts: {
          all: visible.length,
          active: visible.filter((u) => !!u.isActive).length,
          locked: visible.filter((u) => !u.isActive).length,
        },
        stateSplit: { active: splitOf(true), locked: splitOf(false) },
        // Số này lấy từ query tổng (đã lọc state/utmId) - có thể lệch nhẹ so với current.newCustomers nếu UTM ẩn vì restricted.
        periodNewCustomers: totals.newCustomers,
        newCustomers: noUtm.newCustomers,
        newCustomersNoUtm: noUtm.newCustomersNoUtm,
        totalByStatus,
      },
      utms,
      bySource: overallSource,
      bySales: overallSales.map((r) => personRow(r, '(Chưa có Sales)')).sort(byRevenue),
      byMarketing: overallMarketing.map((r) => personRow(r, '(Chưa gán Marketing)')).sort(byRevenue),
      trend,
    };
  }

  // ═══════════════════════════ QUERY BUILDING BLOCKS ═══════════════════════════

  private isOwnOnly(ctx: Ctx): boolean {
    return ctx.scope === PermissionScope.OWN && ctx.viewerRole !== Role.ADMIN;
  }

  private isUtmVisible(u: Utm, m: UtmQualityMetrics | undefined, viewerId: number, seeAll: boolean): boolean {
    if (seeAll || u.visibility === 'shared') return true;
    if (u.primaryManagerId === viewerId) return true;
    if ((u.secondaryManagers ?? []).some((s) => s.userId === viewerId)) return true;
    return (m?.customers ?? 0) > 0;
  }

  /** Lọc theo Sales/Marketing phụ trách của KHÁCH (0 = chưa gán). */
  private applyPeople(qb: SelectQueryBuilder<Customer>, ctx: Ctx): void {
    if (ctx.salesUserId !== undefined) {
      if (ctx.salesUserId === NO_PERSON) qb.andWhere('customer.salesUserId IS NULL');
      else qb.andWhere('customer.salesUserId = :fSales', { fSales: ctx.salesUserId });
    }
    if (ctx.marketingUserId !== undefined) {
      if (ctx.marketingUserId === NO_PERSON) qb.andWhere('customer.marketingUserId IS NULL');
      else qb.andWhere('customer.marketingUserId = :fMarketing', { fMarketing: ctx.marketingUserId });
    }
  }

  /**
   * Khách người xem được thấy (RBAC = CustomerAccessHelper) ĐÃ GẮN UTM (innerJoin -> khách không UTM bị loại) + lọc Sales/Marketing.
   * `scoped=true`: thêm lọc góc nhìn (Hoạt động/Đã khoá) + 1 UTM cụ thể - dùng cho MỌI số liệu tổng hợp.
   * `scoped=false`: giữ mọi UTM - dùng cho số liệu TỪNG UTM để đếm được cả 3 góc nhìn từ 1 lần query.
   */
  private baseQb(ctx: Ctx, scoped: boolean): SelectQueryBuilder<Customer> {
    const qb = this.customerRepo.createQueryBuilder('customer');
    CustomerAccessHelper.applyViewFilter(qb, ctx.viewerId, ctx.viewerRole, ctx.scope);
    qb.innerJoin('customer.utm', 'utm');
    this.applyPeople(qb, ctx);
    if (scoped) {
      // is_active là tinyint không có transformer -> so sánh số 1/0 (không truyền boolean qua QueryBuilder).
      if (ctx.state === 'active') qb.andWhere('utm.isActive = 1');
      else if (ctx.state === 'locked') qb.andWhere('utm.isActive = 0');
      if (ctx.utmId) qb.andWhere('utm.id = :fUtm', { fUtm: ctx.utmId });
    }
    return qb;
  }

  private rangeParams(ctx: Ctx) {
    return { cFrom: ctx.range.fromUtc, cTo: ctx.range.toUtc, depFrom: ctx.range.from, depTo: ctx.range.to };
  }

  /** 1 query tổng hợp toàn bộ chỉ số, GROUP BY UTM. */
  private async collectMetrics(ctx: Ctx): Promise<Map<number, UtmQualityMetrics>> {
    // ⚠️ leftJoin deposits nhân bản dòng khách theo số khoản nạp -> MỌI số đếm khách phải DISTINCT customer.id;
    // tiền SUM(deposit.amount) thì mỗi khoản nạp đúng 1 dòng nên không bị nhân đôi.
    const rows = await this.baseQb(ctx, false)
      .leftJoin('customer.deposits', 'deposit')
      .select('utm.id', 'k')
      .addSelect('COUNT(DISTINCT customer.id)', 'customers')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${IN_CREATED} THEN customer.id END)`, 'newCustomers')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${HAS_DEPOSIT} THEN customer.id END)`, 'depositedCustomers')
      .addSelect("COUNT(DISTINCT CASE WHEN customer.status = 'closed' THEN customer.id END)", 'closedCustomers')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${IN_CREATED} AND ${HAS_DEPOSIT} THEN customer.id END)`, 'newDeposited')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${IN_CREATED} AND customer.status = 'closed' THEN customer.id END)`, 'newClosed')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${IN_DEPOSIT} THEN customer.id END)`, 'periodDepositors')
      .addSelect(`SUM(CASE WHEN ${IN_DEPOSIT} THEN deposit.amount ELSE 0 END)`, 'periodRevenue')
      .addSelect('SUM(deposit.amount)', 'lifetimeRevenue')
      .addSelect(`SUM(CASE WHEN ${IN_CREATED} THEN deposit.amount ELSE 0 END)`, 'newLifetimeRevenue')
      .addSelect('COUNT(deposit.id)', 'depositCount')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${HAS_REDEPOSIT} THEN customer.id END)`, 'redepositors')
      .groupBy('utm.id')
      .setParameters(this.rangeParams(ctx))
      .getRawMany();

    // TB số ngày tới khoản nạp đầu: query RIÊNG không join deposits - join deposits sẽ nhân dòng theo số khoản nạp
    // và làm AVG lệch về phía khách nạp nhiều lần.
    const dayRows = await this.baseQb(ctx, false)
      .leftJoin(FIRST_DEPOSIT_JOIN, 'fd', 'fd.customer_id = customer.id')
      .select('utm.id', 'k')
      .addSelect(
        `AVG(CASE WHEN fd.first_dep IS NOT NULL AND fd.first_dep >= ${CREATED_DAY} THEN DATEDIFF(fd.first_dep, ${CREATED_DAY}) END)`,
        'avgDays',
      )
      .addSelect(`COUNT(CASE WHEN fd.first_dep IS NOT NULL AND fd.first_dep >= ${CREATED_DAY} THEN 1 END)`, 'daysN')
      .groupBy('utm.id')
      .getRawMany();
    const days = new Map<number, { avg: number | null; n: number }>();
    for (const r of dayRows) days.set(Number(r.k), { avg: r.avgDays == null ? null : Number(r.avgDays), n: Number(r.daysN) || 0 });

    const map = new Map<number, UtmQualityMetrics>();
    for (const r of rows) {
      const d = days.get(Number(r.k));
      map.set(Number(r.k), {
        customers: Number(r.customers) || 0,
        newCustomers: Number(r.newCustomers) || 0,
        depositedCustomers: Number(r.depositedCustomers) || 0,
        closedCustomers: Number(r.closedCustomers) || 0,
        newDeposited: Number(r.newDeposited) || 0,
        newClosed: Number(r.newClosed) || 0,
        periodDepositors: Number(r.periodDepositors) || 0,
        periodRevenue: Number(r.periodRevenue) || 0,
        lifetimeRevenue: Number(r.lifetimeRevenue) || 0,
        newLifetimeRevenue: Number(r.newLifetimeRevenue) || 0,
        depositCount: Number(r.depositCount) || 0,
        redepositors: Number(r.redepositors) || 0,
        avgDaysToFirstDeposit: d?.avg == null ? null : Math.round(d.avg * 10) / 10,
        avgDaysSamples: d?.avg == null ? 0 : d.n,
      });
    }
    return map;
  }

  /** Khách chia theo (UTM, status hiện tại). */
  private async collectStatusPivot(ctx: Ctx): Promise<Map<number, Record<string, number>>> {
    const rows = await this.baseQb(ctx, false)
      .select('utm.id', 'k')
      .addSelect('customer.status', 'status')
      .addSelect('COUNT(DISTINCT customer.id)', 'cnt')
      .groupBy('utm.id')
      .addGroupBy('customer.status')
      .getRawMany();

    const map = new Map<number, Record<string, number>>();
    for (const r of rows) {
      const key = Number(r.k);
      const entry = map.get(key) ?? {};
      entry[String(r.status)] = (entry[String(r.status)] ?? 0) + (Number(r.cnt) || 0);
      map.set(key, entry);
    }
    return map;
  }

  /** Sales / Marketing tham gia TỪNG UTM: khách, đã nạp, đã chốt, doanh thu (1 query cho mọi UTM). */
  private async collectParticipants(ctx: Ctx, col: PersonColumn): Promise<Map<number, Omit<UtmParticipant, 'user'>[]>> {
    const person = `IFNULL(customer.${col}, 0)`;
    const rows = await this.baseQb(ctx, false)
      .leftJoin('customer.deposits', 'deposit')
      .select('utm.id', 'k')
      .addSelect(person, 'p')
      .addSelect('COUNT(DISTINCT customer.id)', 'customers')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${HAS_DEPOSIT} THEN customer.id END)`, 'depositedCustomers')
      .addSelect("COUNT(DISTINCT CASE WHEN customer.status = 'closed' THEN customer.id END)", 'closedCustomers')
      .addSelect('SUM(deposit.amount)', 'lifetimeRevenue')
      .groupBy('utm.id')
      .addGroupBy(person)
      .getRawMany();

    const map = new Map<number, Omit<UtmParticipant, 'user'>[]>();
    for (const r of rows) {
      const list = map.get(Number(r.k)) ?? [];
      list.push({
        userId: Number(r.p) || 0,
        customers: Number(r.customers) || 0,
        depositedCustomers: Number(r.depositedCustomers) || 0,
        closedCustomers: Number(r.closedCustomers) || 0,
        lifetimeRevenue: Number(r.lifetimeRevenue) || 0,
      });
      map.set(Number(r.k), list);
    }
    return map;
  }

  /** Tổng theo NGUỒN khách (đã lọc góc nhìn/UTM) - nguồn nào đem về khách của UTM nạp/chốt tốt. */
  private async collectBySource(ctx: Ctx): Promise<UtmSourceRow[]> {
    const rows = await this.baseQb(ctx, true)
      .leftJoin('customer.deposits', 'deposit')
      .select('customer.source', 'k')
      .addSelect('COUNT(DISTINCT customer.id)', 'customers')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${HAS_DEPOSIT} THEN customer.id END)`, 'depositedCustomers')
      .addSelect("COUNT(DISTINCT CASE WHEN customer.status = 'closed' THEN customer.id END)", 'closedCustomers')
      .addSelect('SUM(deposit.amount)', 'lifetimeRevenue')
      .groupBy('customer.source')
      .getRawMany();

    return rows
      .map((r) => ({
        source: r.k ? String(r.k) : '(Không rõ)',
        customers: Number(r.customers) || 0,
        depositedCustomers: Number(r.depositedCustomers) || 0,
        closedCustomers: Number(r.closedCustomers) || 0,
        lifetimeRevenue: Number(r.lifetimeRevenue) || 0,
      }))
      .sort((a, b) => b.customers - a.customers);
  }

  /** Tổng theo SALES hoặc MARKETING phụ trách khách (đã lọc góc nhìn/UTM) - xếp hạng người tham gia. */
  private async collectByPerson(
    ctx: Ctx,
    col: PersonColumn,
  ): Promise<Omit<UtmPersonRow, 'userName' | 'role' | 'departmentName' | 'departmentColor' | 'positionName' | 'positionColor'>[]> {
    const person = `IFNULL(customer.${col}, 0)`;
    const rows = await this.baseQb(ctx, true)
      .leftJoin('customer.deposits', 'deposit')
      .select(person, 'k')
      .addSelect('COUNT(DISTINCT customer.id)', 'customers')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${IN_CREATED} THEN customer.id END)`, 'newCustomers')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${HAS_DEPOSIT} THEN customer.id END)`, 'depositedCustomers')
      .addSelect("COUNT(DISTINCT CASE WHEN customer.status = 'closed' THEN customer.id END)", 'closedCustomers')
      .addSelect(`SUM(CASE WHEN ${IN_DEPOSIT} THEN deposit.amount ELSE 0 END)`, 'periodRevenue')
      .addSelect('SUM(deposit.amount)', 'lifetimeRevenue')
      .addSelect('COUNT(DISTINCT utm.id)', 'utmCount')
      .groupBy(person)
      .setParameters(this.rangeParams(ctx))
      .getRawMany();

    return rows.map((r) => ({
      userId: Number(r.k) || 0,
      customers: Number(r.customers) || 0,
      newCustomers: Number(r.newCustomers) || 0,
      depositedCustomers: Number(r.depositedCustomers) || 0,
      closedCustomers: Number(r.closedCustomers) || 0,
      periodRevenue: Number(r.periodRevenue) || 0,
      lifetimeRevenue: Number(r.lifetimeRevenue) || 0,
      utmCount: Number(r.utmCount) || 0,
    }));
  }

  /** Khách mới + tiền nạp theo ngày/tháng trong kỳ, ĐÃ ĐIỀN 0 cho ngày/tháng trống. */
  private async collectTrend(ctx: Ctx, granularity: 'day' | 'month'): Promise<UtmTrendPoint[]> {
    const { range } = ctx;
    const f = granularity === 'month' ? '%Y-%m' : '%Y-%m-%d';
    const createdBucket = `DATE_FORMAT(DATE_ADD(customer.createdAt, INTERVAL 7 HOUR), '${f}')`;
    const depositBucket = `DATE_FORMAT(deposit.depositDate, '${f}')`;

    const [createdRows, depositRows] = await Promise.all([
      this.baseQb(ctx, true)
        .andWhere(IN_CREATED, { cFrom: range.fromUtc, cTo: range.toUtc })
        .select(createdBucket, 'b')
        .addSelect('COUNT(DISTINCT customer.id)', 'n')
        .groupBy(createdBucket)
        .getRawMany(),
      this.baseQb(ctx, true)
        .innerJoin('customer.deposits', 'deposit')
        .andWhere(IN_DEPOSIT, { depFrom: range.from, depTo: range.to })
        .select(depositBucket, 'b')
        .addSelect('SUM(deposit.amount)', 'revenue')
        .addSelect('COUNT(DISTINCT customer.id)', 'depositors')
        .groupBy(depositBucket)
        .getRawMany(),
    ]);

    const points = new Map<string, UtmTrendPoint>();
    for (const b of this.buildBuckets(range, granularity)) points.set(b, { date: b, newCustomers: 0, revenue: 0, depositors: 0 });
    for (const r of createdRows) {
      const p = points.get(String(r.b));
      if (p) p.newCustomers = Number(r.n) || 0;
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

  /** 3 số của 1 kỳ (đã lọc góc nhìn/UTM) - dùng cho kỳ trước để so sánh xu hướng. */
  private async collectPeriodTotals(ctx: Ctx): Promise<{ newCustomers: number; periodRevenue: number; periodDepositors: number }> {
    const row = await this.baseQb(ctx, true)
      .leftJoin('customer.deposits', 'deposit')
      .select(`COUNT(DISTINCT CASE WHEN ${IN_CREATED} THEN customer.id END)`, 'newCustomers')
      .addSelect(`COUNT(DISTINCT CASE WHEN ${IN_DEPOSIT} THEN customer.id END)`, 'periodDepositors')
      .addSelect(`SUM(CASE WHEN ${IN_DEPOSIT} THEN deposit.amount ELSE 0 END)`, 'periodRevenue')
      .setParameters(this.rangeParams(ctx))
      .getRawOne();
    return {
      newCustomers: Number(row?.newCustomers) || 0,
      periodRevenue: Number(row?.periodRevenue) || 0,
      periodDepositors: Number(row?.periodDepositors) || 0,
    };
  }

  /**
   * Data MỚI trong kỳ (theo ngày tạo) và bao nhiêu khách CHƯA gắn UTM nào - tín hiệu "data rơi khỏi đo lường UTM".
   * Không lọc góc nhìn/UTM (khách không UTM không thuộc UTM nào); vẫn tôn trọng phạm vi xem + lọc Sales/Marketing.
   */
  private async collectNoUtm(ctx: Ctx): Promise<{ newCustomers: number; newCustomersNoUtm: number }> {
    const qb = this.customerRepo.createQueryBuilder('customer');
    CustomerAccessHelper.applyViewFilter(qb, ctx.viewerId, ctx.viewerRole, ctx.scope);
    this.applyPeople(qb, ctx);
    const row = await qb
      .andWhere(IN_CREATED, { cFrom: ctx.range.fromUtc, cTo: ctx.range.toUtc })
      .select('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN customer.utmId IS NULL THEN 1 ELSE 0 END)', 'noUtm')
      .getRawOne();
    return { newCustomers: Number(row?.total) || 0, newCustomersNoUtm: Number(row?.noUtm) || 0 };
  }

  // ═══════════════════════════ HELPERS ═══════════════════════════

  private async loadUsers(ids: number[]): Promise<Map<number, UtmUserBrief>> {
    const map = new Map<number, UtmUserBrief>();
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
