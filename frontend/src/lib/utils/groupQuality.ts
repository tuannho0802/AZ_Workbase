import type { GroupQualityMetrics, GroupQualityRow } from '@/lib/types/reports.types';
import { pct } from './marketingReport';
import { RATE_COLORS, rateLevel } from './rateColor';

/** Nhóm có ít thành viên hơn ngưỡng này thì % dao động quá mạnh -> không kết luận tốt/yếu, chỉ ghi "ít mẫu". */
export const MIN_SAMPLE_MEMBERS = 5;

export interface GroupRates {
  /** Thành viên đã từng nạp / thành viên (cùng tập -> luôn ≤ 100%). */
  depositRate: number | null;
  /** Thành viên đã chốt / thành viên. */
  closeRate: number | null;
  /** Cohort join trong kỳ: đã nạp / join trong kỳ. */
  newJoinDepositRate: number | null;
  /** Cohort join trong kỳ: đã chốt / join trong kỳ. */
  newJoinCloseRate: number | null;
  /** Tiền mọi thời điểm / thành viên (USD). null nếu chưa có thành viên. */
  revenuePerMember: number | null;
  /** Tiền mọi thời điểm / thành viên đã nạp (USD). null nếu chưa ai nạp. */
  revenuePerDepositor: number | null;
  /** Thành viên CHƯA nạp lần nào - khách cần chăm sóc để kéo nạp. */
  notDeposited: number;
  /** Cohort join trong kỳ: CHƯA nạp lần nào. */
  newJoinNotDeposited: number;
  /** Cohort join trong kỳ: tiền mọi thời điểm của họ / số khách join trong kỳ (USD). null nếu kỳ không có ai join. */
  revenuePerNewJoin: number | null;
}

export function groupRates(m: GroupQualityMetrics): GroupRates {
  return {
    depositRate: pct(m.depositedMembers, m.members),
    closeRate: pct(m.closedMembers, m.members),
    newJoinDepositRate: pct(m.newJoinsDeposited, m.newJoins),
    newJoinCloseRate: pct(m.newJoinsClosed, m.newJoins),
    revenuePerMember: m.members > 0 ? m.lifetimeRevenue / m.members : null,
    revenuePerDepositor: m.depositedMembers > 0 ? m.lifetimeRevenue / m.depositedMembers : null,
    notDeposited: Math.max(0, m.members - m.depositedMembers),
    newJoinNotDeposited: Math.max(0, m.newJoins - m.newJoinsDeposited),
    revenuePerNewJoin: m.newJoins > 0 ? m.newJoinsLifetimeRevenue / m.newJoins : null,
  };
}

export type GroupHealthKey = 'empty' | 'small' | 'low' | 'mid' | 'high';

export interface GroupHealth {
  key: GroupHealthKey;
  label: string;
  /** Màu Tag antd (preset hoặc hex). */
  color: string;
}

/**
 * Đánh giá 1 nhóm theo TỶ LỆ NẠP của thành viên (chỉ số chất lượng chính), dùng cùng ngưỡng màu % của trang báo cáo
 * (< 40% đỏ, 40–80% vàng, > 80% xanh). Nhóm trống / ít mẫu KHÔNG bị chấm điểm để tránh kết luận sai.
 */
export function groupHealth(m: GroupQualityMetrics): GroupHealth {
  if (m.members === 0) return { key: 'empty', label: 'Nhóm trống', color: 'default' };
  if (m.members < MIN_SAMPLE_MEMBERS) return { key: 'small', label: 'Ít mẫu', color: 'default' };
  const level = rateLevel(pct(m.depositedMembers, m.members));
  if (level === 'low') return { key: 'low', label: 'Cần xử lý', color: RATE_COLORS.low };
  if (level === 'high') return { key: 'high', label: 'Tốt', color: RATE_COLORS.high };
  return { key: 'mid', label: 'Trung bình', color: RATE_COLORS.mid };
}

export type GroupRankMetric =
  | 'lifetimeRevenue'
  | 'periodRevenue'
  | 'members'
  | 'newJoins'
  | 'depositRate'
  | 'closeRate';

export const GROUP_RANK_LABEL: Record<GroupRankMetric, string> = {
  lifetimeRevenue: 'Doanh thu tổng',
  periodRevenue: 'Doanh thu trong kỳ',
  members: 'Số thành viên',
  newJoins: 'Join trong kỳ',
  depositRate: 'Tỷ lệ nạp',
  closeRate: 'Tỷ lệ chốt',
};

export const isMoneyRank = (m: GroupRankMetric) => m === 'lifetimeRevenue' || m === 'periodRevenue';
export const isRateRank = (m: GroupRankMetric) => m === 'depositRate' || m === 'closeRate';

/** Giá trị dùng để xếp hạng. Tỷ lệ chỉ xếp cho nhóm ĐỦ MẪU (nhóm ít thành viên -> null, bị loại). */
export function rankValue(r: GroupQualityRow, metric: GroupRankMetric): number | null {
  if (metric === 'depositRate') return r.members >= MIN_SAMPLE_MEMBERS ? pct(r.depositedMembers, r.members) : null;
  if (metric === 'closeRate') return r.members >= MIN_SAMPLE_MEMBERS ? pct(r.closedMembers, r.members) : null;
  return r[metric];
}

/** Top N nhóm theo chỉ số (giảm dần), bỏ nhóm không có giá trị hoặc = 0. */
export function topGroups(rows: GroupQualityRow[], metric: GroupRankMetric, limit: number) {
  return rows
    .map((r) => ({ row: r, name: r.groupName, value: rankValue(r, metric) }))
    .filter((x): x is { row: GroupQualityRow; name: string; value: number } => x.value != null && x.value > 0)
    .sort((a, b) => b.value - a.value || b.row.members - a.row.members)
    .slice(0, limit);
}

export interface GroupInsights {
  /** Nhóm nhiều thành viên nhưng tỷ lệ nạp thấp - ưu tiên xử lý (sắp theo số khách chưa nạp giảm dần). */
  needsAttention: GroupQualityRow[];
  /** Nhóm tỷ lệ nạp cao nhất (đủ mẫu) - đối chiếu cách vận hành để nhân rộng. */
  bestPractice: GroupQualityRow[];
  /** Nhóm chưa có thành viên nào. */
  emptyGroups: GroupQualityRow[];
  /** Nhóm có khách nhưng KHÔNG ai nạp và đã đủ mẫu (trường hợp nặng nhất). */
  zeroDeposit: GroupQualityRow[];
}

/** Gợi ý xử lý nhanh từ bảng nhóm hiện có - thuần tính toán trên dữ liệu đã tải, không gọi API. */
export function buildGroupInsights(rows: GroupQualityRow[], limit = 3): GroupInsights {
  const enough = rows.filter((r) => r.members >= MIN_SAMPLE_MEMBERS);
  const rate = (r: GroupQualityRow) => pct(r.depositedMembers, r.members) ?? 0;
  return {
    needsAttention: enough
      .filter((r) => groupHealth(r).key === 'low')
      .sort((a, b) => b.members - b.depositedMembers - (a.members - a.depositedMembers))
      .slice(0, limit),
    bestPractice: enough
      .filter((r) => groupHealth(r).key === 'high')
      .sort((a, b) => rate(b) - rate(a) || b.lifetimeRevenue - a.lifetimeRevenue)
      .slice(0, limit),
    emptyGroups: rows.filter((r) => r.members === 0).slice(0, limit),
    zeroDeposit: enough.filter((r) => r.depositedMembers === 0).slice(0, limit),
  };
}

/** Lọc bảng nhóm theo tên nhóm/Category/quản lý (không phân biệt hoa thường, bỏ dấu) và ẩn nhóm trống. */
export function filterGroupRows(
  rows: GroupQualityRow[],
  opts: { search?: string; hideEmpty?: boolean },
  normalize: (s: string) => string,
): GroupQualityRow[] {
  const q = normalize((opts.search ?? '').trim());
  return rows.filter((r) => {
    if (opts.hideEmpty && r.members === 0) return false;
    if (!q) return true;
    return [r.groupName, r.categoryName ?? '', r.primaryManager?.name ?? ''].some((t) => normalize(t).includes(q));
  });
}
