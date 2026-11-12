import type { MetricKey } from '../api/fanpages.api';

export const METRIC_LABELS: Record<MetricKey, string> = {
    followers: 'Followers',
    reach: 'Reach',
    engagement: 'Tương tác',
    views: 'Lượt xem',
};

/** Cột theo thứ tự trên lưới nhập (dùng cho dán từ Excel). */
const COLS: MetricKey[] = ['followers', 'reach', 'engagement', 'views'];

export const fmtNum = (v: number | null | undefined): string => (v == null ? '—' : v.toLocaleString('vi-VN'));

/** 'YYYY-MM-DD' -> 'YYYY-MM' (chuỗi, không qua Date -> không dính múi giờ). */
export const monthOfDate = (date: string): string => date.slice(0, 7);

/** "+30 / 7 ngày" - luôn kèm số ngày để không so sánh táo với cam. Rỗng khi chưa có lần so. */
export function formatDelta(delta: number | null | undefined, days: number | null | undefined): string {
    if (delta == null) return '';
    const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
    const d = days != null && days > 0 ? ` / ${days} ngày` : '';
    return `${sign}${Math.abs(delta).toLocaleString('vi-VN')}${d}`;
}

/** Cùng ngưỡng với BE (giảm > 50%). Chỉ để tô cảnh báo sớm; BE vẫn là nơi chặn thật. */
export function isSuspiciousDrop(previous: number | null | undefined, next: number | null | undefined): boolean {
    if (previous == null || next == null || previous <= 0) return false;
    return next < previous * 0.5;
}

/** % tiến độ mục tiêu, chặn 0-100; null khi chưa đủ số liệu / không có mục tiêu. */
export function targetProgress(actual: number | null, target: number | null): number | null {
    if (actual == null || target == null || target <= 0) return null;
    return Math.max(0, Math.min(100, Math.round((actual / target) * 100)));
}

/** Ô dán: số nguyên >= 0 (cho phép dấu chấm/phẩy/khoảng trắng phân tách nghìn); '' = bỏ qua; khác = 'invalid'. */
export type PastedCell = number | 'invalid' | null;

export function parsePasted(text: string): PastedCell[][] {
    const lines = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n');
    return lines.map((line) =>
        line.split('\t').map((raw): PastedCell => {
            const t = raw.trim();
            if (t === '') return null;
            const cleaned = t.replace(/[.,\s]/g, '');
            return /^\d+$/.test(cleaned) ? Number(cleaned) : 'invalid';
        }),
    );
}

export interface PasteResult {
    values: Map<number, Partial<Record<MetricKey, number | null>>>;
    invalidCells: number;
    truncatedRows: number;
}

/** Áp ma trận dán vào lưới bắt đầu từ (rowIndex, colIndex). Dòng thừa so với lưới bị cắt; cột thừa bị bỏ; ô trống KHÔNG ghi đè. */
export function applyPaste(matrix: PastedCell[][], rowIds: number[], rowIndex: number, colIndex: number): PasteResult {
    const values = new Map<number, Partial<Record<MetricKey, number | null>>>();
    let invalidCells = 0;
    let truncatedRows = 0;
    matrix.forEach((cells, i) => {
        const id = rowIds[rowIndex + i];
        if (id == null) {
            truncatedRows++;
            return;
        }
        cells.forEach((c, j) => {
            const key = COLS[colIndex + j];
            if (key == null || c === null) return;
            if (c === 'invalid') {
                invalidCells++;
                return;
            }
            values.set(id, { ...(values.get(id) ?? {}), [key]: c });
        });
    });
    return { values, invalidCells, truncatedRows };
}
