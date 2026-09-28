import { getReportPeriodRange, getNowVn, ReportPeriodType } from '../../common/utils/date-vn.util';

export interface ResolvedReportRange {
  /** 'YYYY-MM-DD HH:mm:ss' naive giờ VN - dùng cho cột `date` do người dùng chọn (deposit_date, closed_date). */
  from: string;
  to: string;
  /** Lùi 7 tiếng - dùng cho cột timestamp DB tự sinh (created_at, joined_at) vốn đang lưu UTC. */
  fromUtc: string;
  toUtc: string;
}

export interface RangeQuery {
  period: ReportPeriodType;
  anchor?: string;
  customFrom?: string;
  customTo?: string;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

const fmtDate = (d: Date) => fmt(d).slice(0, 10);

function toResolved(start: Date, end: Date): ResolvedReportRange {
  return {
    from: fmt(start),
    to: fmt(end),
    fromUtc: fmt(new Date(start.getTime() - VN_OFFSET_MS)),
    toUtc: fmt(new Date(end.getTime() - VN_OFFSET_MS)),
  };
}

/**
 * Suy ra khoảng ngày của báo cáo - LOGIC GỐC của `ReportsService.resolveRange()`
 * (tách ra đây để `ReportsMarketingService` dùng chung, KHÔNG viết lại: đây là
 * chỗ đã từng có bug lệch múi giờ UTC/naive, xem giải thích đầy đủ ở reports.service.ts).
 */
export function resolveReportRange(query: RangeQuery): ResolvedReportRange {
  const anchor = query.anchor ? new Date(`${query.anchor}T00:00:00`) : getNowVn();
  const { start, end } = getReportPeriodRange(query.period, anchor, query.customFrom, query.customTo);
  return toResolved(start, end);
}

/**
 * Kỳ LIỀN TRƯỚC để so sánh: tuần/tháng/quý/năm = kỳ lịch trọn vẹn liền trước;
 * custom = cùng số ngày, kết thúc ngay trước ngày bắt đầu kỳ hiện tại.
 */
export function resolvePreviousReportRange(query: RangeQuery): ResolvedReportRange {
  const anchor = query.anchor ? new Date(`${query.anchor}T00:00:00`) : getNowVn();
  const { start, end } = getReportPeriodRange(query.period, anchor, query.customFrom, query.customTo);

  if (query.period === 'custom') {
    const spanDays = Math.round((new Date(fmtDate(end)).getTime() - new Date(fmtDate(start)).getTime()) / DAY_MS) + 1;
    const prevEndDay = new Date(start.getTime() - DAY_MS);
    const prevStartDay = new Date(prevEndDay.getTime() - (spanDays - 1) * DAY_MS);
    const r = getReportPeriodRange('custom', undefined, fmtDate(prevStartDay), fmtDate(prevEndDay));
    return toResolved(r.start, r.end);
  }

  const dayBefore = new Date(start.getTime() - DAY_MS);
  const prev = getReportPeriodRange(query.period, dayBefore);
  return toResolved(prev.start, prev.end);
}

/** Số ngày (bao gồm cả 2 đầu) của 1 khoảng đã resolve. */
export function spanDaysOf(range: Pick<ResolvedReportRange, 'from' | 'to'>): number {
  return Math.round((new Date(range.to.slice(0, 10)).getTime() - new Date(range.from.slice(0, 10)).getTime()) / DAY_MS) + 1;
}
