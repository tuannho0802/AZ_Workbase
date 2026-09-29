/**
 * Màu chữ/thanh tiến độ cho các con số TỶ LỆ % (chốt / join nhóm / nạp...) ở trang Báo cáo.
 * Quy ước: < 40% đỏ, 40% -> 80% vàng, > 80% xanh lá. `null`/NaN (không có mẫu số) -> undefined (giữ màu mặc định).
 */
export const RATE_COLORS = {
  low: '#f5222d',
  mid: '#faad14',
  high: '#52c41a',
} as const;

/** Vàng #faad14 quá nhạt khi làm CHỮ trên nền trắng -> dùng tông đậm hơn cho text. */
const TEXT_MID = '#d48806';
const TEXT_HIGH = '#389e0d';

export type RateLevel = 'low' | 'mid' | 'high';

export function rateLevel(pct: number | null | undefined): RateLevel | undefined {
  if (pct == null || Number.isNaN(pct)) return undefined;
  if (pct < 40) return 'low';
  if (pct > 80) return 'high';
  return 'mid';
}

/** Màu cho THANH (Progress strokeColor) hoặc số lớn (Statistic). */
export function rateColor(pct: number | null | undefined): string | undefined {
  const l = rateLevel(pct);
  return l ? RATE_COLORS[l] : undefined;
}

/** Màu cho CHỮ nhỏ trong bảng (đủ tương phản trên nền trắng). */
export function rateTextColor(pct: number | null | undefined): string | undefined {
  const l = rateLevel(pct);
  if (!l) return undefined;
  return l === 'low' ? RATE_COLORS.low : l === 'mid' ? TEXT_MID : TEXT_HIGH;
}
