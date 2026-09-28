import type { MarketingMetrics, MarketingReportFilters, MarketingUserRow } from '@/lib/types/reports.types';

/** Hàm THUẦN cho tab "Marketing" của trang /reports (tách riêng để test được, không phụ thuộc React). */

export type RankMetric = 'revenue' | 'depositedCustomers' | 'totalCustomers' | 'closedCustomers';

export const RANK_METRIC_LABEL: Record<RankMetric, string> = {
    revenue: 'Doanh thu',
    depositedCustomers: 'Khách nạp',
    totalCustomers: 'Data mới',
    closedCustomers: 'Đã chốt',
};

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const count = new Intl.NumberFormat('vi-VN');

export const formatUsd = (n: number): string => usd.format(Number.isFinite(n) ? n : 0);

export const fmtCount = (n: number): string => count.format(Number.isFinite(n) ? n : 0);

/** Nhãn trục biểu đồ gọn: $1.5K, $2.3M. */
export function formatUsdCompact(n: number): string {
    const v = Number.isFinite(n) ? n : 0;
    const abs = Math.abs(v);
    const trim = (x: number) => String(Math.round(x * 10) / 10);
    if (abs >= 1_000_000) return `$${trim(v / 1_000_000)}M`;
    if (abs >= 1_000) return `$${trim(v / 1_000)}K`;
    return `$${trim(v)}`;
}

/** Phần trăm 1 chữ số thập phân, trần 100. `null` khi mẫu số ≤ 0 (không chia cho 0, FE hiện "—"). */
export function pct(numerator: number, denominator: number): number | null {
    if (!(denominator > 0)) return null;
    return Math.min(100, Math.round((numerator / denominator) * 1000) / 10);
}

export interface Delta {
    diff: number;
    /** null khi kỳ trước = 0 (không có gốc để tính %). */
    percent: number | null;
    direction: 'up' | 'down' | 'flat';
}

export function deltaOf(value: number, previous: number): Delta {
    const diff = Math.round((value - previous) * 100) / 100;
    const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    const percent = previous > 0 ? Math.round((diff / previous) * 1000) / 10 : null;
    return { diff, percent, direction };
}

/** Nhãn trục X: 'YYYY-MM-DD' -> 'DD/MM'; 'YYYY-MM' -> 'MM/YYYY'. Thuần chuỗi, không qua Date (tránh lệch múi giờ). */
export function trendLabel(date: string, granularity: 'day' | 'month'): string {
    if (granularity === 'month') {
        const [y, m] = date.split('-');
        return `${m}/${y}`;
    }
    const [, m, d] = date.split('-');
    return `${d}/${m}`;
}

/** Số bộ lọc đang bật. `0` của marketingUserId/createdById là giá trị HỢP LỆ ("chưa gán") nên vẫn tính là bật. */
export function countActiveFilters(f: MarketingReportFilters): number {
    return Object.values(f).filter((v) => v !== undefined && v !== null && v !== '').length;
}

/** Top N theo chỉ số (bỏ dòng = 0), giảm dần. Không đổi mảng gốc. */
export function topRows<T extends MarketingMetrics>(rows: T[], metric: RankMetric, limit: number): T[] {
    return [...rows]
        .filter((r) => r[metric] > 0)
        .sort((a, b) => b[metric] - a[metric])
        .slice(0, limit);
}

/**
 * Dữ liệu biểu đồ tỷ trọng: top `maxSlices` người có tên + "Khác" (gộp phần còn lại) + dòng "chưa gán"
 * (giữ riêng, luôn ở cuối) để TỔNG các lát khớp với KPI.
 */
export function withOthers(
    rows: MarketingUserRow[],
    metric: RankMetric,
    maxSlices: number,
): { name: string; value: number }[] {
    const positive = rows.filter((r) => r[metric] > 0);
    const assigned = positive.filter((r) => r.userId > 0).sort((a, b) => b[metric] - a[metric]);
    const unassigned = positive.find((r) => r.userId === 0);

    const out = assigned.slice(0, maxSlices).map((r) => ({ name: r.userName, value: r[metric] }));
    const rest = assigned.slice(maxSlices).reduce((s, r) => s + r[metric], 0);
    if (rest > 0) out.push({ name: 'Khác', value: rest });
    if (unassigned) out.push({ name: unassigned.userName, value: unassigned[metric] });
    return out;
}

/** Bỏ dấu tiếng Việt + về chữ thường để tìm tên "khong dau" vẫn ra. */
export const normalizeText = (s: string): string =>
    s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .trim();

export const isEmptyRow = (r: MarketingMetrics): boolean =>
    r.totalCustomers === 0 &&
    r.closedCustomers === 0 &&
    r.joinedGroupCustomers === 0 &&
    r.depositedCustomers === 0 &&
    r.revenue === 0;

export function filterUserRows(
    rows: MarketingUserRow[],
    opts: { search?: string; staffDepartmentId?: number; hideEmpty?: boolean },
): MarketingUserRow[] {
    const q = normalizeText(opts.search ?? '');
    return rows.filter((r) => {
        if (opts.hideEmpty && isEmptyRow(r)) return false;
        if (opts.staffDepartmentId != null && r.departmentId !== opts.staffDepartmentId) return false;
        if (q && !normalizeText(r.userName).includes(q)) return false;
        return true;
    });
}

export function sumRows(rows: MarketingMetrics[]): MarketingMetrics {
    return rows.reduce<MarketingMetrics>(
        (acc, r) => ({
            totalCustomers: acc.totalCustomers + r.totalCustomers,
            closedCustomers: acc.closedCustomers + r.closedCustomers,
            joinedGroupCustomers: acc.joinedGroupCustomers + r.joinedGroupCustomers,
            depositedCustomers: acc.depositedCustomers + r.depositedCustomers,
            revenue: acc.revenue + r.revenue,
            cohortDepositedCustomers: acc.cohortDepositedCustomers + r.cohortDepositedCustomers,
        }),
        {
            totalCustomers: 0,
            closedCustomers: 0,
            joinedGroupCustomers: 0,
            depositedCustomers: 0,
            revenue: 0,
            cohortDepositedCustomers: 0,
        },
    );
}

/**
 * Tỷ lệ của 1 dòng. CHỈ có tỷ lệ "cohort" (data mới đã từng nạp / data mới) là hợp lệ để chia -
 * các chỉ số khác dùng cột ngày khác nhau nên chia cho nhau có thể ra > 100% (xem JSDoc BE).
 */
export function rowRates(r: MarketingMetrics): { cohortDepositRate: number | null; avgPerDepositor: number | null } {
    return {
        cohortDepositRate: pct(r.cohortDepositedCustomers, r.totalCustomers),
        avgPerDepositor: r.depositedCustomers > 0 ? r.revenue / r.depositedCustomers : null,
    };
}
