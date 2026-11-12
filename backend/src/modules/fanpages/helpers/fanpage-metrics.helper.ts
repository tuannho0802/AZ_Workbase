import { addDays, isValidDateStr, spanDays } from '../../utms/helpers/utm-stats.helper';
import { weekEndOf, weekStartOf } from './fanpage-cadence.helper';

/**
 * Luật số liệu định kỳ / thống kê Fanpage - HÀM THUẦN (không DB, không đồng hồ), mirror `fanpage-cadence.helper.ts`.
 * Mọi ngày là chuỗi `YYYY-MM-DD` giờ VN; "hôm nay" do NGƯỜI GỌI truyền vào. Cấm `new Date()` ở đây (lệch múi giờ).
 */

export const METRIC_KEYS = ['followers', 'reach', 'engagement', 'views'] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

/** Trần giá trị 1 chỉ số (cột INT UNSIGNED tối đa ~4,29 tỷ; chặn sớm số vô lý do gõ nhầm). */
export const METRIC_MAX_VALUE = 2_000_000_000;
/** Giảm quá ngưỡng này so với lần nhập trước = nghi gõ nhầm (chỉ CẢNH BÁO, không chặn - PLAN 6.4). */
export const SUSPICIOUS_DROP_RATIO = 0.5;
/** Kỳ thống kê dài tối đa (cùng ngưỡng UTM stats). */
export const FANPAGE_STATS_MAX_SPAN_DAYS = 366;
/** Kỳ dài hơn ngưỡng này thì gom theo THÁNG thay vì tuần. */
export const FANPAGE_STATS_MONTH_THRESHOLD_DAYS = 92;
export const FANPAGE_STATS_DEFAULT_DAYS = 30;
/** Tối đa số Page được chọn để so sánh trên chart (PLAN 8.5). */
export const FANPAGE_STATS_MAX_COMPARE = 5;
export const FANPAGE_HEATMAP_MAX_WEEKS = 52;

export type GrowthGroupBy = 'week' | 'month';

export interface DatedValue {
    date: string;
    value: number;
}

// ───────────── Ngày / tháng ─────────────

export const isValidMonth = (m: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

export const monthOf = (date: string): string => date.slice(0, 7);

/** Ngày cuối của tháng 'YYYY-MM'. */
export function monthEnd(month: string): string {
    const [y, m] = month.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export const monthStart = (month: string): string => `${month}-01`;

export type RangeResult = { ok: true; from: string; to: string } | { ok: false; message: string };

/**
 * Chuẩn hoá kỳ thống kê. Thiếu `to` = hôm nay, thiếu `from` = 30 ngày gần nhất (gồm hôm nay).
 * `to` không được ở tương lai (số liệu nhập tay không có "tương lai"); kỳ tối đa 366 ngày.
 */
export function resolveStatsRange(from: string | undefined, to: string | undefined, today: string): RangeResult {
    const end = to ?? today;
    const start = from ?? addDays(end, -(FANPAGE_STATS_DEFAULT_DAYS - 1));
    if (!isValidDateStr(start) || !isValidDateStr(end)) return { ok: false, message: 'Ngày không hợp lệ' };
    if (end > today) return { ok: false, message: '"Đến ngày" không được ở tương lai' };
    if (start > end) return { ok: false, message: '"Từ ngày" phải trước hoặc bằng "Đến ngày"' };
    if (spanDays(start, end) > FANPAGE_STATS_MAX_SPAN_DAYS) {
        return { ok: false, message: `Kỳ thống kê tối đa ${FANPAGE_STATS_MAX_SPAN_DAYS} ngày` };
    }
    return { ok: true, from: start, to: end };
}

export const pickGrowthGroupBy = (from: string, to: string): GrowthGroupBy =>
    spanDays(from, to) > FANPAGE_STATS_MONTH_THRESHOLD_DAYS ? 'month' : 'week';

// ───────────── Kiểm tra số liệu nhập ─────────────

export interface MetricInput {
    followers?: number | null;
    reach?: number | null;
    engagement?: number | null;
    views?: number | null;
}

/** Có ít nhất 1 chỉ số có giá trị (PLAN 6.4: snapshot rỗng hoàn toàn là vô nghĩa). */
export const hasAnyMetric = (m: MetricInput): boolean => METRIC_KEYS.some((k) => m[k] != null);

/** Lỗi đầu tiên của 1 dòng số liệu, hoặc null nếu hợp lệ. `today` để chặn ngày tương lai. */
export function validateSnapshot(date: string, m: MetricInput, today: string): string | null {
    if (!isValidDateStr(date)) return 'Ngày số liệu không hợp lệ';
    if (date > today) return 'Ngày số liệu không được ở tương lai';
    for (const k of METRIC_KEYS) {
        const v = m[k];
        if (v == null) continue;
        if (!Number.isInteger(v) || v < 0) return `${k}: phải là số nguyên không âm`;
        if (v > METRIC_MAX_VALUE) return `${k}: giá trị quá lớn`;
    }
    if (!hasAnyMetric(m)) return 'Cần nhập ít nhất 1 chỉ số';
    return null;
}

/** Giảm > 50% so với lần nhập trước (lần trước phải > 0). Chỉ để CẢNH BÁO nghi gõ nhầm. */
export function isSuspiciousDrop(previous: number | null | undefined, next: number | null | undefined): boolean {
    if (previous == null || next == null || previous <= 0) return false;
    return next < previous * SUSPICIOUS_DROP_RATIO;
}

// ───────────── Carry-forward / delta ─────────────

/** Giá trị gần nhất có ngày <= `date` (mảng đã sắp TĂNG dần theo ngày). Chưa có -> null. */
export function carryForward(rowsAsc: ReadonlyArray<DatedValue>, date: string): DatedValue | null {
    let found: DatedValue | null = null;
    for (const r of rowsAsc) {
        if (r.date > date) break;
        found = r;
    }
    return found;
}

export interface LatestMetric {
    date: string;
    followers: number;
    /** So với lần nhập trước đó (null nếu chưa có lần trước). */
    delta: number | null;
    /** Số ngày cách nhau giữa 2 lần nhập - luôn đi kèm delta để không so sánh táo với cam (PLAN 3.6). */
    deltaDays: number | null;
}

/** Từ 2 dòng gần nhất (mới nhất trước) tính follower hiện tại + chênh lệch. */
export function latestFollowerMetric(latest: DatedValue | null, previous: DatedValue | null): LatestMetric | null {
    if (!latest) return null;
    if (!previous) return { date: latest.date, followers: latest.value, delta: null, deltaDays: null };
    return {
        date: latest.date,
        followers: latest.value,
        delta: latest.value - previous.value,
        deltaDays: spanDays(previous.date, latest.date) - 1,
    };
}

export interface WindowGain {
    gain: number;
    baselineDate: string;
    latestDate: string;
}

/**
 * Follower tăng/giảm trong cửa sổ [from, to] của 1 Page (rowsAsc đã sắp tăng dần).
 * Mốc đầu = lần nhập gần nhất TRƯỚC `from`; chưa có thì lấy lần nhập đầu tiên TRONG cửa sổ.
 * Chưa có số liệu, hoặc mốc đầu trùng mốc cuối (chỉ 1 lần nhập) -> null (không đủ dữ liệu để so).
 */
export function windowGain(rowsAsc: ReadonlyArray<DatedValue>, from: string, to: string): WindowGain | null {
    const latest = carryForward(rowsAsc, to);
    if (!latest) return null;
    const before = carryForward(rowsAsc, addDays(from, -1));
    const baseline = before ?? rowsAsc.find((r) => r.date >= from && r.date <= to) ?? null;
    if (!baseline || baseline.date === latest.date) return null;
    return { gain: latest.value - baseline.value, baselineDate: baseline.date, latestDate: latest.date };
}

// ───────────── Bucket + chuỗi tăng trưởng ─────────────

export interface GrowthBucket {
    /** Khoá hiển thị: ngày Thứ Hai của tuần ('YYYY-MM-DD') hoặc 'YYYY-MM'. */
    key: string;
    /** Ngày cuối của bucket (đã cắt theo `to`) - mốc để carry-forward. */
    end: string;
}

/** Danh sách bucket liên tục từ `from` tới `to` (gồm bucket đầu/cuối dở dang). */
export function buildGrowthBuckets(from: string, to: string, groupBy: GrowthGroupBy): GrowthBucket[] {
    const out: GrowthBucket[] = [];
    if (groupBy === 'week') {
        for (let start = weekStartOf(from); start <= to; start = addDays(start, 7)) {
            const end = weekEndOf(start);
            out.push({ key: start, end: end > to ? to : end });
        }
        return out;
    }
    for (let m = monthOf(from); m <= monthOf(to); m = monthOf(addDays(monthEnd(m), 1))) {
        const end = monthEnd(m);
        out.push({ key: m, end: end > to ? to : end });
    }
    return out;
}

export interface GrowthPageInput {
    id: number;
    /** Dòng follower của Page, sắp TĂNG dần, GỒM cả mốc nền trước `from` (để carry-forward). */
    rows: DatedValue[];
}

export interface GrowthPoint {
    key: string;
    /** Tổng follower các Page đã có số liệu tới thời điểm đó (carry-forward). */
    total: number;
    /** Số Page đã có số liệu tới thời điểm đó. */
    pagesWithData: number;
}

export interface GrowthSeries {
    points: GrowthPoint[];
    /** Chuỗi từng Page theo cùng bucket (null = Page chưa có số liệu tới bucket đó) - chỉ cho Page được yêu cầu so sánh. */
    perPage: Array<{ id: number; values: Array<number | null> }>;
    /** Page KHÔNG có số liệu nào tới hết kỳ -> bị bỏ khỏi tổng, FE ghi chú "N Page chưa có số liệu" (PLAN 3.6). */
    pagesWithoutMetrics: number;
}

/** Chuỗi tăng trưởng tổng + từng Page. Page chưa có snapshot nào bị bỏ khỏi tổng (không coi là 0). */
export function buildGrowthSeries(
    pages: ReadonlyArray<GrowthPageInput>,
    buckets: ReadonlyArray<GrowthBucket>,
    comparePageIds: ReadonlySet<number> = new Set(),
): GrowthSeries {
    const points: GrowthPoint[] = buckets.map((b) => ({ key: b.key, total: 0, pagesWithData: 0 }));
    const perPage: GrowthSeries['perPage'] = [];
    let pagesWithoutMetrics = 0;
    const lastEnd = buckets.length ? buckets[buckets.length - 1].end : '';

    for (const page of pages) {
        if (!carryForward(page.rows, lastEnd)) pagesWithoutMetrics++;
        const values = buckets.map((b) => carryForward(page.rows, b.end)?.value ?? null);
        values.forEach((v, i) => {
            if (v == null) return;
            points[i].total += v;
            points[i].pagesWithData++;
        });
        if (comparePageIds.has(page.id)) perPage.push({ id: page.id, values });
    }
    return { points, perPage, pagesWithoutMetrics };
}

// ───────────── Bài đăng theo tuần / heatmap ─────────────

export interface WeeklyPostBucket {
    weekStart: string;
    weekEnd: string;
    count: number;
}

/** Gom số bài theo tuần Thứ Hai-CN trong [from, to]; đủ mọi tuần kể cả 0 bài. `rows` = (ngày đăng, số bài). */
export function bucketPostsByWeek(rows: ReadonlyArray<{ date: string; count: number }>, from: string, to: string): WeeklyPostBucket[] {
    const byWeek = new Map<string, number>();
    for (const r of rows) {
        if (r.date < from || r.date > to) continue;
        const w = weekStartOf(r.date);
        byWeek.set(w, (byWeek.get(w) ?? 0) + r.count);
    }
    const out: WeeklyPostBucket[] = [];
    for (let w = weekStartOf(from); w <= to; w = addDays(w, 7)) {
        out.push({ weekStart: w, weekEnd: weekEndOf(w), count: byWeek.get(w) ?? 0 });
    }
    return out;
}

export interface HeatmapCell {
    date: string;
    count: number;
    /** Ngày sau hôm nay (chỉ để lấp đủ tuần hiện tại cho lưới). */
    future: boolean;
}

export interface Heatmap {
    from: string;
    to: string;
    weeks: number;
    cells: HeatmapCell[];
}

/** Lưới `weeks` tuần kết thúc ở tuần chứa `today` (đủ 7 ngày/tuần, Thứ Hai -> Chủ Nhật). */
export function buildHeatmap(rows: ReadonlyArray<{ date: string; count: number }>, today: string, weeks: number): Heatmap {
    const w = Math.min(Math.max(Math.trunc(weeks) || 1, 1), FANPAGE_HEATMAP_MAX_WEEKS);
    const from = addDays(weekStartOf(today), -(w - 1) * 7);
    const to = weekEndOf(today);
    const counts = new Map(rows.map((r) => [r.date, r.count]));
    const cells: HeatmapCell[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
        cells.push({ date: d, count: counts.get(d) ?? 0, future: d > today });
    }
    return { from, to, weeks: w, cells };
}

/** Tổng tương tác 1 bài = like + comment + share (bỏ view; chỉ cộng số đã nhập). */
export const postInteractions = (p: { likes: number | null; comments: number | null; shares: number | null }): number =>
    (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);