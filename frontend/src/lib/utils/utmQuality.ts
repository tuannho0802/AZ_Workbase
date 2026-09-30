import type { UtmQualityMetrics, UtmQualityRow } from '@/lib/types/reports.types';
import { pct } from './marketingReport';
import { RATE_COLORS, rateLevel } from './rateColor';

/** UTM có ít khách hơn ngưỡng này thì % dao động quá mạnh -> không kết luận tốt/yếu, chỉ ghi "ít mẫu". */
export const MIN_SAMPLE_CUSTOMERS = 5;

export interface UtmRates {
  /** Khách đã từng nạp / khách của UTM (cùng tập -> luôn ≤ 100%). */
  depositRate: number | null;
  /** Khách đã chốt / khách của UTM. */
  closeRate: number | null;
  /** Cohort khách mới trong kỳ: đã nạp / khách mới. */
  newDepositRate: number | null;
  /** Cohort khách mới trong kỳ: đã chốt / khách mới. */
  newCloseRate: number | null;
  /** Khách nạp lại (≥ 2 khoản) / khách đã nạp. */
  redepositRate: number | null;
  /** Tiền mọi thời điểm / khách của UTM (USD). null nếu chưa có khách. */
  revenuePerCustomer: number | null;
  /** Tiền mọi thời điểm / khách đã nạp (USD). null nếu chưa ai nạp. */
  revenuePerDepositor: number | null;
  /** Khách CHƯA nạp lần nào - cần chăm sóc để kéo nạp. */
  notDeposited: number;
  /** Cohort khách mới trong kỳ: CHƯA nạp lần nào. */
  newNotDeposited: number;
  /** Cohort khách mới trong kỳ: tiền mọi thời điểm của họ / số khách mới (USD). null nếu kỳ không có khách mới. */
  newRevenuePerCustomer: number | null;
}

export function utmRates(m: UtmQualityMetrics): UtmRates {
  return {
    depositRate: pct(m.depositedCustomers, m.customers),
    closeRate: pct(m.closedCustomers, m.customers),
    newDepositRate: pct(m.newDeposited, m.newCustomers),
    newCloseRate: pct(m.newClosed, m.newCustomers),
    redepositRate: pct(m.redepositors, m.depositedCustomers),
    revenuePerCustomer: m.customers > 0 ? m.lifetimeRevenue / m.customers : null,
    revenuePerDepositor: m.depositedCustomers > 0 ? m.lifetimeRevenue / m.depositedCustomers : null,
    notDeposited: Math.max(0, m.customers - m.depositedCustomers),
    newNotDeposited: Math.max(0, m.newCustomers - m.newDeposited),
    newRevenuePerCustomer: m.newCustomers > 0 ? m.newLifetimeRevenue / m.newCustomers : null,
  };
}

export type UtmHealthKey = 'empty' | 'small' | 'low' | 'mid' | 'high';

export interface UtmHealth {
  key: UtmHealthKey;
  label: string;
  /** Màu Tag antd (preset hoặc hex). */
  color: string;
}

/**
 * Đánh giá 1 UTM theo TỶ LỆ NẠP của khách (chỉ số chất lượng chính), cùng ngưỡng màu % của trang báo cáo
 * (< 40% đỏ, 40–80% vàng, > 80% xanh). UTM trống / ít mẫu KHÔNG bị chấm điểm để tránh kết luận sai.
 */
export function utmHealth(m: UtmQualityMetrics): UtmHealth {
  if (m.customers === 0) return { key: 'empty', label: 'UTM trống', color: 'default' };
  if (m.customers < MIN_SAMPLE_CUSTOMERS) return { key: 'small', label: 'Ít mẫu', color: 'default' };
  const level = rateLevel(pct(m.depositedCustomers, m.customers));
  if (level === 'low') return { key: 'low', label: 'Cần xử lý', color: RATE_COLORS.low };
  if (level === 'high') return { key: 'high', label: 'Tốt', color: RATE_COLORS.high };
  return { key: 'mid', label: 'Trung bình', color: RATE_COLORS.mid };
}

export type UtmRankMetric =
  | 'lifetimeRevenue'
  | 'periodRevenue'
  | 'customers'
  | 'newCustomers'
  | 'depositRate'
  | 'closeRate';

export const UTM_RANK_LABEL: Record<UtmRankMetric, string> = {
  lifetimeRevenue: 'Doanh thu tổng',
  periodRevenue: 'Doanh thu trong kỳ',
  customers: 'Số khách',
  newCustomers: 'Khách mới trong kỳ',
  depositRate: 'Tỷ lệ nạp',
  closeRate: 'Tỷ lệ chốt',
};

export const isMoneyRank = (m: UtmRankMetric) => m === 'lifetimeRevenue' || m === 'periodRevenue';
export const isRateRank = (m: UtmRankMetric) => m === 'depositRate' || m === 'closeRate';

/** Giá trị dùng để xếp hạng. Tỷ lệ chỉ xếp cho UTM ĐỦ MẪU (ít khách -> null, bị loại). */
export function rankValue(r: UtmQualityRow, metric: UtmRankMetric): number | null {
  if (metric === 'depositRate') return r.customers >= MIN_SAMPLE_CUSTOMERS ? pct(r.depositedCustomers, r.customers) : null;
  if (metric === 'closeRate') return r.customers >= MIN_SAMPLE_CUSTOMERS ? pct(r.closedCustomers, r.customers) : null;
  return r[metric];
}

/** Top N UTM theo chỉ số (giảm dần), bỏ UTM không có giá trị hoặc = 0. */
export function topUtms(rows: UtmQualityRow[], metric: UtmRankMetric, limit: number) {
  return rows
    .map((r) => ({ row: r, name: r.utmName, value: rankValue(r, metric) }))
    .filter((x): x is { row: UtmQualityRow; name: string; value: number } => x.value != null && x.value > 0)
    .sort((a, b) => b.value - a.value || b.row.customers - a.row.customers)
    .slice(0, limit);
}

export interface UtmInsights {
  /** UTM nhiều khách nhưng tỷ lệ nạp thấp - ưu tiên xử lý (sắp theo số khách chưa nạp giảm dần). */
  needsAttention: UtmQualityRow[];
  /** UTM tỷ lệ nạp cao nhất (đủ mẫu) - đối chiếu cách chạy để nhân rộng. */
  bestPractice: UtmQualityRow[];
  /** UTM chưa có khách nào. */
  emptyUtms: UtmQualityRow[];
  /** UTM có khách nhưng KHÔNG ai nạp và đã đủ mẫu (trường hợp nặng nhất). */
  zeroDeposit: UtmQualityRow[];
}

/** Gợi ý xử lý nhanh từ bảng UTM hiện có - thuần tính toán trên dữ liệu đã tải, không gọi API. */
export function buildUtmInsights(rows: UtmQualityRow[], limit = 3): UtmInsights {
  const enough = rows.filter((r) => r.customers >= MIN_SAMPLE_CUSTOMERS);
  const rate = (r: UtmQualityRow) => pct(r.depositedCustomers, r.customers) ?? 0;
  return {
    needsAttention: enough
      .filter((r) => utmHealth(r).key === 'low')
      .sort((a, b) => b.customers - b.depositedCustomers - (a.customers - a.depositedCustomers))
      .slice(0, limit),
    bestPractice: enough
      .filter((r) => utmHealth(r).key === 'high')
      .sort((a, b) => rate(b) - rate(a) || b.lifetimeRevenue - a.lifetimeRevenue)
      .slice(0, limit),
    emptyUtms: rows.filter((r) => r.customers === 0).slice(0, limit),
    zeroDeposit: enough.filter((r) => r.depositedCustomers === 0).slice(0, limit),
  };
}

/** Lọc bảng UTM theo tên UTM / Quản lý chính-phụ (không phân biệt hoa thường, bỏ dấu), ẩn UTM trống và ẩn UTM đã khoá. */
export function filterUtmRows(
  rows: UtmQualityRow[],
  opts: { search?: string; hideEmpty?: boolean; hideLocked?: boolean },
  normalize: (s: string) => string,
): UtmQualityRow[] {
  const q = normalize((opts.search ?? '').trim());
  return rows.filter((r) => {
    if (opts.hideEmpty && r.customers === 0) return false;
    if (opts.hideLocked && !r.isActive) return false;
    if (!q) return true;
    return [r.utmName, r.primaryManager?.name ?? '', ...r.secondaryManagers.map((m) => m.name)].some((t) => normalize(t).includes(q));
  });
}
