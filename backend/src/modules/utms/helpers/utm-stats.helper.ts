/**
 * Thống kê UTM theo ngày khách được thêm - các hàm THUẦN (không phụ thuộc DB) để dễ test.
 *
 * "Ngày khách được thêm vào UTM" = `customers.input_date` (Ngày nhập khách - cột `date` naive giờ VN,
 * KHÔNG có lệch múi giờ như `created_at`). Bảng `customers` chưa lưu thời điểm gắn UTM riêng nên đây là
 * mốc gần nhất (khách thường được gắn UTM ngay lúc nhập).
 */

export type UtmStatsGranularity = 'day' | 'month';

/** Kỳ dài hơn ngưỡng này thì gộp theo THÁNG (cùng ngưỡng với báo cáo UTM/Marketing). */
export const UTM_STATS_MONTH_THRESHOLD_DAYS = 92;
/** Chặn kỳ quá dài (tránh quét cả bảng khách). */
export const UTM_STATS_MAX_SPAN_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' -> ms UTC nửa đêm (không phụ thuộc múi giờ máy chủ). */
const toMs = (d: string): number => {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
};

const fmtDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export function isValidDateStr(d: string): boolean {
  if (!DATE_RE.test(d)) return false;
  return fmtDay(toMs(d)) === d;
}

/** Số ngày (gồm cả 2 đầu). */
export function spanDays(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS) + 1;
}

export function addDays(d: string, n: number): string {
  return fmtDay(toMs(d) + n * DAY_MS);
}

export function pickGranularity(from: string, to: string): UtmStatsGranularity {
  return spanDays(from, to) > UTM_STATS_MONTH_THRESHOLD_DAYS ? 'month' : 'day';
}

/** Khoá bucket của 1 ngày: 'YYYY-MM-DD' (day) hoặc 'YYYY-MM' (month). */
export function bucketKey(date: string, granularity: UtmStatsGranularity): string {
  return granularity === 'month' ? date.slice(0, 7) : date;
}

/** Danh sách bucket liên tục (kể cả bucket 0 khách) từ `from` tới `to`, tăng dần. */
export function buildBuckets(from: string, to: string, granularity: UtmStatsGranularity): string[] {
  const out: string[] = [];
  const end = toMs(to);
  for (let ms = toMs(from); ms <= end; ms += DAY_MS) {
    const key = bucketKey(fmtDay(ms), granularity);
    if (out[out.length - 1] !== key) out.push(key);
  }
  return out;
}

/** 1 dòng GROUP BY (ngày nhập, UTM, trạng thái). */
export interface UtmStatsRawRow {
  date: string;
  utmId: number;
  status: string;
  cnt: number;
}

export interface UtmStatsPoint {
  date: string;
  total: number;
  byStatus: Record<string, number>;
}

export interface UtmStatsUtmRow {
  utmId: number;
  total: number;
  byStatus: Record<string, number>;
}

export interface UtmStatsAggregate {
  totals: { total: number; byStatus: Record<string, number> };
  series: UtmStatsPoint[];
  byUtm: UtmStatsUtmRow[];
}

const zeroByStatus = (codes: string[]): Record<string, number> => {
  const r: Record<string, number> = {};
  codes.forEach((c) => (r[c] = 0));
  return r;
};

/**
 * Gom dòng thô thành: tổng, chuỗi theo bucket (đủ mọi bucket, đủ mọi status kể cả 0) và bảng theo UTM.
 * `statusCodes` = danh sách status muốn hiển thị; status lạ (mồ côi khỏi bảng customer_statuses) được BỔ SUNG
 * vào cuối để tổng luôn khớp - trả trong `statusCodes`.
 */
export function aggregateUtmStats(
  rows: UtmStatsRawRow[],
  statusCodes: string[],
  buckets: string[],
  granularity: UtmStatsGranularity,
): UtmStatsAggregate & { statusCodes: string[] } {
  const codes = [...statusCodes];
  for (const r of rows) if (!codes.includes(r.status)) codes.push(r.status);

  const totals = { total: 0, byStatus: zeroByStatus(codes) };
  const seriesMap = new Map<string, UtmStatsPoint>(
    buckets.map((b) => [b, { date: b, total: 0, byStatus: zeroByStatus(codes) }]),
  );
  const utmMap = new Map<number, UtmStatsUtmRow>();

  for (const r of rows) {
    const cnt = Number(r.cnt) || 0;
    if (cnt === 0) continue;
    totals.total += cnt;
    totals.byStatus[r.status] += cnt;

    const point = seriesMap.get(bucketKey(r.date, granularity));
    if (point) {
      point.total += cnt;
      point.byStatus[r.status] += cnt;
    }

    let u = utmMap.get(r.utmId);
    if (!u) {
      u = { utmId: r.utmId, total: 0, byStatus: zeroByStatus(codes) };
      utmMap.set(r.utmId, u);
    }
    u.total += cnt;
    u.byStatus[r.status] += cnt;
  }

  return {
    statusCodes: codes,
    totals,
    series: buckets.map((b) => seriesMap.get(b)!),
    byUtm: [...utmMap.values()].sort((a, b) => b.total - a.total || a.utmId - b.utmId),
  };
}
