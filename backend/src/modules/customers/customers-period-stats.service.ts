import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import { Deposit } from '../../database/entities/deposit.entity';
import { todayVnStr } from '../../common/utils/date-vn.util';
import { resolvePreviousReportRange, resolveReportRange } from '../reports/report-range.util';
import { CustomerAccessHelper } from './helpers/customer-access.helper';
import { shiftDateStr } from './customers-invalid-stats.service';
import { CustomerStatsPeriod, QueryCustomerPeriodStatsDto } from './dto/query-customer-period-stats.dto';

export interface DateWindow {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

/** Khoảng ngày TRỌN VẸN chứa `anchor`. day = đúng 1 ngày; còn lại dùng chung logic với /reports (Thứ Hai->CN...). */
export function resolveCustomerStatsWindow(period: CustomerStatsPeriod, anchor?: string): DateWindow {
  const a = anchor ?? todayVnStr();
  if (period === 'day') return { from: a, to: a };
  const r = resolveReportRange({ period, anchor: a });
  return { from: r.from.slice(0, 10), to: r.to.slice(0, 10) };
}

/** Kỳ liền trước cùng loại - dùng để so sánh tăng/giảm. */
export function resolvePreviousCustomerStatsWindow(period: CustomerStatsPeriod, anchor?: string): DateWindow {
  const a = anchor ?? todayVnStr();
  if (period === 'day') {
    const p = shiftDateStr(a, -1);
    return { from: p, to: p };
  }
  const r = resolvePreviousReportRange({ period, anchor: a });
  return { from: r.from.slice(0, 10), to: r.to.slice(0, 10) };
}

/** Năm -> gộp theo tháng; còn lại theo ngày. */
export function granularityOf(period: CustomerStatsPeriod): 'day' | 'month' {
  return period === 'year' ? 'month' : 'day';
}

/** Sinh đủ các bucket liên tục từ `from` -> `to` (kể cả bucket không có dữ liệu = 0 để FE vẽ trục không bị đứt). */
export function buildBuckets(window: DateWindow, granularity: 'day' | 'month'): string[] {
  const out: string[] = [];
  if (granularity === 'day') {
    for (let d = window.from; d <= window.to; d = shiftDateStr(d, 1)) out.push(d);
    return out;
  }
  let [y, m] = window.from.split('-').map(Number);
  const [ey, em] = window.to.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

const num = (v: unknown) => Number(v) || 0;
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Thống kê khách hàng THEO GIAI ĐOẠN (Ngày/Tuần/Tháng/Năm) cho trang /customers.
 *
 * KHÁC /reports ở 3 điểm (chủ đích, đã thống nhất với người dùng):
 * 1. Phạm vi xem = ĐÚNG phạm vi của danh sách khách (`CustomerAccessHelper.applyViewFilter`), không tách
 *    "Cá nhân/Phòng ban" - để số trên thẻ khớp với số dòng người dùng thấy ở bảng bên dưới.
 * 2. "Giai đoạn NHẬP" dùng `customer.inputDate` (cột DATE, đúng cột "Ngày nhập" + bộ lọc ngày của bảng),
 *    KHÔNG dùng `createdAt` (UTC, lệch với inputDate khi Import Excel) như /reports.
 * 3. "Giai đoạn XỬ LÝ" = khách có status='closed' và `closedDate` trong kỳ. Hệ thống CHƯA có lịch sử đổi
 *    status cho các trạng thái khác, nên chỉ "Đã chốt" có mốc thời gian xử lý thật.
 *
 * Mọi cột ngày ở đây (`inputDate`, `closedDate`, `depositDate`) đều là kiểu DATE do người dùng chọn -> so sánh
 * thẳng chuỗi YYYY-MM-DD, KHÔNG quy đổi UTC (khác `createdAt`).
 * Tính ON-DEMAND bằng SQL aggregation, không cache DB (cùng quyết định với reports.service.ts).
 */
@Injectable()
export class CustomersPeriodStatsService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Deposit)
    private readonly depositRepo: Repository<Deposit>,
    @InjectRepository(CustomerStatus)
    private readonly statusRepo: Repository<CustomerStatus>,
  ) {}

  private customerBase(viewerId: number, role: string, scope?: string | null) {
    const qb = this.customerRepo.createQueryBuilder('customer').where('customer.deletedAt IS NULL');
    CustomerAccessHelper.applyViewFilter(qb, viewerId, role, scope);
    return qb;
  }

  private depositBase(viewerId: number, role: string, scope?: string | null) {
    const qb = this.depositRepo
      .createQueryBuilder('deposit')
      .innerJoin('deposit.customer', 'customer')
      .where('customer.deletedAt IS NULL');
    CustomerAccessHelper.applyViewFilter(qb, viewerId, role, scope);
    return qb;
  }

  /** Số liệu tổng hợp của 1 cửa sổ ngày (dùng cho cả kỳ hiện tại lẫn kỳ trước). */
  private async windowSummary(w: DateWindow, viewerId: number, role: string, scope?: string | null) {
    const params = { from: w.from, to: w.to };
    const hasDeposit = 'EXISTS (SELECT 1 FROM deposits dd WHERE dd.customer_id = customer.id)';
    const inInput = 'customer.inputDate BETWEEN :from AND :to';
    const inClosed = "customer.status = 'closed' AND customer.closedDate BETWEEN :from AND :to";

    const isFtd =
      'deposit.id = (SELECT d2.id FROM deposits d2 WHERE d2.customer_id = deposit.customer_id ORDER BY d2.deposit_date ASC, d2.id ASC LIMIT 1)';

    const [counts, inputDep, closedDep, cash] = await Promise.all([
      this.customerBase(viewerId, role, scope)
        .select('1', '_d')
        .addSelect(`SUM(CASE WHEN ${inInput} THEN 1 ELSE 0 END)`, 'entered')
        .addSelect(`SUM(CASE WHEN ${inInput} AND ${hasDeposit} THEN 1 ELSE 0 END)`, 'enteredDeposited')
        .addSelect(`SUM(CASE WHEN ${inClosed} THEN 1 ELSE 0 END)`, 'closed')
        .addSelect(`SUM(CASE WHEN ${inClosed} AND ${hasDeposit} THEN 1 ELSE 0 END)`, 'closedDeposited')
        .setParameters(params)
        .getRawOne(),
      this.depositBase(viewerId, role, scope)
        .select('SUM(deposit.amount)', 'amount')
        .addSelect('COUNT(*)', 'depositCount')
        .andWhere(inInput, params)
        .getRawOne(),
      this.depositBase(viewerId, role, scope)
        .select('SUM(deposit.amount)', 'amount')
        .addSelect('COUNT(*)', 'depositCount')
        .andWhere(inClosed, params)
        .getRawOne(),
      this.depositBase(viewerId, role, scope)
        .select('SUM(deposit.amount)', 'amount')
        .addSelect('COUNT(*)', 'depositCount')
        .addSelect('COUNT(DISTINCT customer.id)', 'depositorCount')
        .addSelect(`SUM(CASE WHEN ${isFtd} THEN 1 ELSE 0 END)`, 'ftdCount')
        .addSelect(`SUM(CASE WHEN ${isFtd} THEN deposit.amount ELSE 0 END)`, 'ftdAmount')
        .andWhere('deposit.depositDate BETWEEN :from AND :to', params)
        .getRawOne(),
    ]);

    const cashAmount = round2(num(cash?.amount));
    const cashCount = num(cash?.depositCount);
    const depositorCount = num(cash?.depositorCount);
    const ftdCount = num(cash?.ftdCount);
    const ftdAmount = round2(num(cash?.ftdAmount));

    return {
      input: {
        entered: num(counts?.entered),
        enteredDeposited: num(counts?.enteredDeposited),
        depositAmount: round2(num(inputDep?.amount)),
        depositCount: num(inputDep?.depositCount),
      },
      handled: {
        closed: num(counts?.closed),
        closedDeposited: num(counts?.closedDeposited),
        depositAmount: round2(num(closedDep?.amount)),
        depositCount: num(closedDep?.depositCount),
      },
      cash: {
        amount: cashAmount,
        depositCount: cashCount,
        depositorCount,
        ftdCount,
        ftdAmount,
        redepositCount: Math.max(0, cashCount - ftdCount),
        redepositAmount: round2(cashAmount - ftdAmount),
        averagePerDepositor: depositorCount > 0 ? round2(cashAmount / depositorCount) : 0,
      },
    };
  }

  async getPeriodStats(query: QueryCustomerPeriodStatsDto, viewerId: number, role: string, scope?: string | null) {
    const window = resolveCustomerStatsWindow(query.period, query.anchor);
    const prevWindow = resolvePreviousCustomerStatsWindow(query.period, query.anchor);
    const granularity = granularityOf(query.period);
    const fmt = granularity === 'month' ? '%Y-%m' : '%Y-%m-%d';
    const params = { from: window.from, to: window.to };

    const inputBucket = `DATE_FORMAT(customer.inputDate, '${fmt}')`;
    const closedBucket = `DATE_FORMAT(customer.closedDate, '${fmt}')`;
    const depositBucket = `DATE_FORMAT(deposit.depositDate, '${fmt}')`;

    const [statuses, current, previous, statusRaw, enteredTrend, closedTrend, depositTrend] = await Promise.all([
      this.statusRepo.find({ order: { sortOrder: 'ASC', id: 'ASC' } }),
      this.windowSummary(window, viewerId, role, scope),
      this.windowSummary(prevWindow, viewerId, role, scope),
      // Chất lượng data NHẬP trong kỳ chia theo status HIỆN TẠI (đã xử lý tới đâu).
      this.customerBase(viewerId, role, scope)
        .select('customer.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .andWhere('customer.inputDate BETWEEN :from AND :to', params)
        .groupBy('customer.status')
        .getRawMany<{ status: string; count: string }>(),
      this.customerBase(viewerId, role, scope)
        .select(inputBucket, 'b')
        .addSelect('COUNT(*)', 'n')
        .andWhere('customer.inputDate BETWEEN :from AND :to', params)
        .groupBy(inputBucket)
        .getRawMany<{ b: string; n: string }>(),
      this.customerBase(viewerId, role, scope)
        .select(closedBucket, 'b')
        .addSelect('COUNT(*)', 'n')
        .andWhere("customer.status = 'closed' AND customer.closedDate BETWEEN :from AND :to", params)
        .groupBy(closedBucket)
        .getRawMany<{ b: string; n: string }>(),
      this.depositBase(viewerId, role, scope)
        .select(depositBucket, 'b')
        .addSelect('SUM(deposit.amount)', 'amount')
        .andWhere('deposit.depositDate BETWEEN :from AND :to', params)
        .groupBy(depositBucket)
        .getRawMany<{ b: string; amount: string }>(),
    ]);

    const statusCount = new Map(statusRaw.map((r) => [r.status, num(r.count)]));
    const byStatus = statuses.map((s) => ({
      code: s.code,
      name: s.name,
      color: s.color,
      count: statusCount.get(s.code) ?? 0,
    }));

    const enteredMap = new Map(enteredTrend.map((r) => [String(r.b), num(r.n)]));
    const closedMap = new Map(closedTrend.map((r) => [String(r.b), num(r.n)]));
    const depositMap = new Map(depositTrend.map((r) => [String(r.b), round2(num(r.amount))]));
    const trend = buildBuckets(window, granularity).map((bucket) => ({
      bucket,
      entered: enteredMap.get(bucket) ?? 0,
      closed: closedMap.get(bucket) ?? 0,
      depositAmount: depositMap.get(bucket) ?? 0,
    }));

    return {
      period: { type: query.period, from: window.from, to: window.to, previousFrom: prevWindow.from, previousTo: prevWindow.to },
      granularity,
      current,
      previous,
      byStatus,
      trend,
    };
  }
}
