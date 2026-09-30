import dayjs from 'dayjs';
import type { UtmStatsPoint, UtmStatsStatus, UtmStatsUtmBrief, UtmStatsUtmRow } from '../api/utms.api';

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

/** Dòng dữ liệu phẳng cho Recharts: { date (khoá bucket thô, dùng khi bấm cột), label, full, total, [code]: giá trị hiển thị, [`${code}__n`]: số khách }. */
export type UtmStatsChartRow = Record<string, string | number>;

/**
 * Chuyển chuỗi ngày thành dữ liệu biểu đồ cột chồng.
 * - 'count'  : giá trị = số khách.
 * - 'percent': giá trị = % của CHÍNH ngày đó (ngày 0 khách -> mọi cột 0, không chia cho 0).
 * Luôn kèm `${code}__n` (số khách thật) và `${code}__p` (%) để tooltip hiện cả hai.
 */
export function toChartRows(series: UtmStatsPoint[], statuses: UtmStatsStatus[], mode: UtmStatsChartMode): UtmStatsChartRow[] {
  return series.map((pt) => {
    const row: UtmStatsChartRow = { date: pt.date, label: bucketLabel(pt.date), full: bucketLabelFull(pt.date), total: pt.total };
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

// ─────────────────────────────────────────────────────────────────────────────
// Quick Filter (Quản lý chính / Quản lý phụ / UTM hoạt động / UTM đã khoá)
// ─────────────────────────────────────────────────────────────────────────────

export interface UtmStatsFilters {
  primaryManagerId?: number;
  secondaryManagerId?: number;
  /** UTM đang hoạt động được chọn (dropdown "UTM hoạt động"). */
  activeUtmIds: number[];
  /** UTM đã khoá được chọn (dropdown "UTM đã khoá"). */
  lockedUtmIds: number[];
}

export const EMPTY_STATS_FILTERS: UtmStatsFilters = { activeUtmIds: [], lockedUtmIds: [] };

export interface SelectOption {
  value: number;
  label: string;
  /** Mã role của người quản lý (dropdown Quản lý chính/phụ) - để tô màu tag. */
  role?: string | null;
  /** Màu UTM (dropdown UTM hoạt động/đã khoá) - để tô màu tag. */
  color?: string;
}

const byName = (a: SelectOption, b: SelectOption) => a.label.localeCompare(b.label, 'vi');

/**
 * Người CÓ quản lý UTM (trong phạm vi người xem): chỉ user đang là Quản lý chính (kind='primary') hoặc Quản lý phụ
 * (kind='secondary') của ít nhất 1 UTM. User không quản lý UTM nào KHÔNG xuất hiện.
 */
export function managerOptions(utms: UtmStatsUtmBrief[], kind: 'primary' | 'secondary'): SelectOption[] {
  const seen = new Map<number, { label: string; role?: string | null }>();
  for (const u of utms) {
    if (kind === 'primary') {
      if (u.primaryManager) seen.set(u.primaryManager.id, { label: u.primaryManager.name, role: u.primaryManager.role });
    } else {
      for (const m of u.secondaryManagers) seen.set(m.id, { label: m.name, role: m.role });
    }
  }
  return [...seen].map(([value, v]) => ({ value, label: v.label, role: v.role })).sort(byName);
}

/** UTM có khớp bộ lọc người quản lý (chính VÀ phụ - giao) không. */
export function matchesManagers(u: UtmStatsUtmBrief, f: Pick<UtmStatsFilters, 'primaryManagerId' | 'secondaryManagerId'>): boolean {
  if (f.primaryManagerId != null && u.primaryManager?.id !== f.primaryManagerId) return false;
  if (f.secondaryManagerId != null && !u.secondaryManagers.some((m) => m.id === f.secondaryManagerId)) return false;
  return true;
}

/** Option của dropdown "UTM hoạt động" (active=true) / "UTM đã khoá" (active=false), thu hẹp theo người quản lý đang chọn. */
export function utmOptionsFor(utms: UtmStatsUtmBrief[], f: UtmStatsFilters, active: boolean): SelectOption[] {
  return utms
    .filter((u) => u.isActive === active && matchesManagers(u, f))
    .map((u) => ({ value: u.id, label: u.name, color: u.color }))
    .sort(byName);
}

/** Đổi người quản lý -> bỏ các UTM đang chọn mà không còn khớp (tránh chọn 1 đằng, kết quả 0 một nẻo). */
export function pruneUtmSelection(utms: UtmStatsUtmBrief[], f: UtmStatsFilters): UtmStatsFilters {
  const ok = new Set(utms.filter((u) => matchesManagers(u, f)).map((u) => u.id));
  return { ...f, activeUtmIds: f.activeUtmIds.filter((id) => ok.has(id)), lockedUtmIds: f.lockedUtmIds.filter((id) => ok.has(id)) };
}

/** Gộp 2 dropdown UTM thành 1 danh sách ID gửi BE; không chọn gì -> undefined (= không lọc theo ID). */
export function mergedUtmIds(f: UtmStatsFilters): number[] | undefined {
  const ids = [...new Set([...f.activeUtmIds, ...f.lockedUtmIds])];
  return ids.length > 0 ? ids : undefined;
}

/** Phần tham số BE của bộ lọc nhanh (dùng chung cho /utms/stats và /utms/stats/customers). */
export function toStatsFilterParams(f: UtmStatsFilters): { utmIds?: number[]; primaryManagerId?: number; secondaryManagerId?: number } {
  return { utmIds: mergedUtmIds(f), primaryManagerId: f.primaryManagerId, secondaryManagerId: f.secondaryManagerId };
}

export function hasActiveStatsFilters(f: UtmStatsFilters): boolean {
  return f.primaryManagerId != null || f.secondaryManagerId != null || f.activeUtmIds.length > 0 || f.lockedUtmIds.length > 0;
}

/** Bỏ ID không còn trong danh sách UTM của phạm vi (UTM bị xoá/đổi quyền) khỏi lựa chọn hiện tại. */
export function dropUnknownUtmIds(utms: UtmStatsUtmBrief[], f: UtmStatsFilters): UtmStatsFilters {
  const activeSet = new Set(utms.filter((u) => u.isActive).map((u) => u.id));
  const lockedSet = new Set(utms.filter((u) => !u.isActive).map((u) => u.id));
  const active = f.activeUtmIds.filter((id) => activeSet.has(id));
  const locked = f.lockedUtmIds.filter((id) => lockedSet.has(id));
  if (active.length === f.activeUtmIds.length && locked.length === f.lockedUtmIds.length) return f;
  return { ...f, activeUtmIds: active, lockedUtmIds: locked };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bấm vào chart/card -> Mini Table khách
// ─────────────────────────────────────────────────────────────────────────────

export interface UtmStatsDrill {
  title: string;
  from: string;
  to: string;
  status?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * Khoảng ngày của 1 bucket trên chart. Bucket ngày -> đúng ngày đó; bucket THÁNG -> cả tháng nhưng CẮT theo kỳ đang xem
 * (tháng đầu/cuối của kỳ chỉ có 1 phần) để số dòng khớp số trên cột.
 */
export function bucketRange(bucket: string, range: { from: string; to: string }): { from: string; to: string } {
  if (DATE_RE.test(bucket)) return { from: bucket, to: bucket };
  if (MONTH_RE.test(bucket)) {
    const start = `${bucket}-01`;
    const end = dayjs(start).endOf('month').format('YYYY-MM-DD');
    return { from: start < range.from ? range.from : start, to: end > range.to ? range.to : end };
  }
  return range;
}

const fmtDayVn = (d: string) => dayjs(d).format('DD/MM/YYYY');

/** Ngữ cảnh mở Mini Table: bấm cột (bucket + trạng thái), card trạng thái (chỉ trạng thái) hoặc card tổng (không gì). */
export function buildDrill(args: { range: { from: string; to: string }; bucket?: string; status?: string; statusName?: string }): UtmStatsDrill {
  const { range, bucket, status, statusName } = args;
  const r = bucket ? bucketRange(bucket, range) : range;
  let title: string;
  if (bucket && MONTH_RE.test(bucket)) title = `Khách tháng ${bucket.slice(5)}/${bucket.slice(0, 4)}`;
  else if (bucket) title = `Khách ngày ${fmtDayVn(r.from)}`;
  else title = `Khách ${fmtDayVn(r.from)} – ${fmtDayVn(r.to)}`;
  if (status) title += ` — ${statusName ?? status}`;
  return { title, from: r.from, to: r.to, status };
}

/**
 * Gom ID khách đã chọn theo UTM của từng khách (Mini Table có khách của NHIỀU UTM, mà API gỡ UTM hàng loạt nhận 1 UTM
 * mỗi lần). Bỏ ID không còn trong danh sách, khách không có UTM, khách Thùng rác.
 */
export function groupCustomerIdsByUtm(
  ids: number[],
  rows: ReadonlyArray<{ id: number; utmId?: number | null; deletedAt?: string | null }>,
): Map<number, number[]> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const groups = new Map<number, number[]>();
  for (const id of ids) {
    const r = byId.get(id);
    if (!r || r.utmId == null || r.deletedAt) continue;
    groups.set(r.utmId, [...(groups.get(r.utmId) ?? []), id]);
  }
  return groups;
}

// ─────────────────────────────────────────────────────────────────────────────
// Màu theo ngưỡng cho chỉ số % (yêu cầu: < 30% đỏ, 30–70% vàng, > 70% xanh)
// ─────────────────────────────────────────────────────────────────────────────

export type RateLevel = 'low' | 'mid' | 'high';

export const RATE_LOW_BELOW = 30;
export const RATE_HIGH_ABOVE = 70;

/** Mức của 1 tỷ lệ %: < 30 thấp (đỏ), 30–70 (gồm cả 30 và 70) trung bình (vàng), > 70 cao (xanh). */
export function rateLevel(pct: number): RateLevel {
  if (pct < RATE_LOW_BELOW) return 'low';
  if (pct > RATE_HIGH_ABOVE) return 'high';
  return 'mid';
}

/** Màu chữ theo mức (đủ tương phản trên nền trắng, không dùng vàng nhạt khó đọc). */
export const RATE_COLORS: Record<RateLevel, string> = {
  low: '#cf1322',
  mid: '#d48806',
  high: '#389e0d',
};

export const rateColor = (pct: number): string => RATE_COLORS[rateLevel(pct)];
