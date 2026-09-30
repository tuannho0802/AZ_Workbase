import type { UtmStatsPoint, UtmStatsStatus, UtmStatsUtmRow } from '../api/utms.api';

/** Tỷ lệ % làm tròn 1 chữ số thập phân; tổng = 0 -> 0 (không NaN). */
export function ratePct(count: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

/** "12,5%" - bỏ phần thập phân khi là số nguyên. */
export function fmtPct(v: number): string {
  return `${Number.isInteger(v) ? v : v.toFixed(1).replace('.', ',')}%`;
}

/** Nhãn trục: 'YYYY-MM-DD' -> 'DD/MM'; 'YYYY-MM' -> 'MM/YYYY'. */
export function bucketLabel(date: string): string {
  const p = date.split('-');
  if (p.length === 3) return `${p[2]}/${p[1]}`;
  if (p.length === 2) return `${p[1]}/${p[0]}`;
  return date;
}

/** Nhãn đầy đủ (tooltip/bảng): 'DD/MM/YYYY' hoặc 'Tháng MM/YYYY'. */
export function bucketLabelFull(date: string): string {
  const p = date.split('-');
  if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
  if (p.length === 2) return `Tháng ${p[1]}/${p[0]}`;
  return date;
}

export type UtmStatsChartMode = 'count' | 'percent';

/** Dòng dữ liệu phẳng cho Recharts: { label, full, total, [code]: giá trị hiển thị, [`${code}__n`]: số khách }. */
export type UtmStatsChartRow = Record<string, string | number>;

/**
 * Chuyển chuỗi ngày thành dữ liệu biểu đồ cột chồng.
 * - 'count'  : giá trị = số khách.
 * - 'percent': giá trị = % của CHÍNH ngày đó (ngày 0 khách -> mọi cột 0, không chia cho 0).
 * Luôn kèm `${code}__n` (số khách thật) và `${code}__p` (%) để tooltip hiện cả hai.
 */
export function toChartRows(series: UtmStatsPoint[], statuses: UtmStatsStatus[], mode: UtmStatsChartMode): UtmStatsChartRow[] {
  return series.map((pt) => {
    const row: UtmStatsChartRow = { label: bucketLabel(pt.date), full: bucketLabelFull(pt.date), total: pt.total };
    for (const s of statuses) {
      const n = pt.byStatus[s.code] ?? 0;
      const p = ratePct(n, pt.total);
      row[s.code] = mode === 'percent' ? p : n;
      row[`${s.code}__n`] = n;
      row[`${s.code}__p`] = p;
    }
    return row;
  });
}

/** Trạng thái thật sự có khách trong kỳ - chart/legend chỉ hiện các trạng thái này cho đỡ rối. */
export function statusesWithData(statuses: UtmStatsStatus[], byStatus: Record<string, number>): UtmStatsStatus[] {
  return statuses.filter((s) => (byStatus[s.code] ?? 0) > 0);
}

/** Sắp bảng theo UTM: nhiều khách nhất trước, cùng số thì theo tên. */
export function sortUtmStatsRows(rows: UtmStatsUtmRow[], nameOf: (id: number) => string): UtmStatsUtmRow[] {
  return [...rows].sort((a, b) => b.total - a.total || nameOf(a.utmId).localeCompare(nameOf(b.utmId), 'vi'));
}

/** Nhãn phạm vi hiển thị cho người xem (khớp mô tả ở tab "Tất cả UTM"). */
export function utmScopeLabel(scope: string): string {
  switch (scope) {
    case 'all':
      return 'Tất cả UTM';
    case 'department':
      return 'UTM thuộc phòng ban bạn quản lý (và UTM bạn là Quản lý chính/phụ)';
    case 'own':
      return 'UTM bạn là Quản lý chính/phụ';
    default:
      return 'UTM trong phạm vi của bạn';
  }
}

/** Khớp `UTM_STATS_MAX_SPAN_DAYS` của BE - chặn chọn khoảng ngày quá dài ngay ở FE. */
export const UTM_STATS_MAX_SPAN_DAYS = 366;
