import dayjs from 'dayjs';
import type { MetricKey } from '../api/fanpages.api';

export const METRIC_LABELS: Record<MetricKey, string> = {
    followers: 'Follow kênh',
    views: 'Lượt xem kênh',
};

/** Cột theo thứ tự trên lưới nhập (dùng cho dán từ Excel). */
const COLS: MetricKey[] = ['followers', 'views'];

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

// ───────────── Kỳ số liệu (GĐ8) ─────────────

export type PeriodMode = 'day' | 'week' | 'month' | 'range';
export interface PeriodSel {
    /** Ngày CUỐI kỳ (= `date` gửi BE). */
    date: string;
    /** Ngày ĐẦU kỳ; null = kỳ 1 ngày. */
    periodStart: string | null;
}

const D = 'YYYY-MM-DD';
export const PERIOD_MODE_LABELS: Record<PeriodMode, string> = { day: 'Ngày', week: 'Tuần', month: 'Tháng', range: 'Tuỳ chọn' };

/**
 * Chuẩn hoá kỳ người dùng chọn -> { date: ngày cuối, periodStart: ngày đầu | null }. Hàm thuần (nhận `today` từ ngoài).
 * Tuần = Thứ Hai -> Chủ Nhật; Tháng = mùng 1 -> cuối tháng; kỳ chưa kết thúc thì kẹp ngày cuối = hôm nay (BE cấm ngày tương lai).
 * Kỳ chỉ còn 1 ngày (ví dụ tuần này mới có thứ Hai) -> periodStart = null.
 */
export function buildPeriod(mode: PeriodMode, start: dayjs.Dayjs, end: dayjs.Dayjs | undefined, today: dayjs.Dayjs): PeriodSel {
    let s = start;
    let e = start;
    if (mode === 'week') {
        s = start.subtract((start.day() + 6) % 7, 'day'); // dayjs: CN = 0 -> lùi về Thứ Hai
        e = s.add(6, 'day');
    } else if (mode === 'month') {
        s = start.startOf('month');
        e = start.endOf('month');
    } else if (mode === 'range') {
        e = end ?? start;
    }
    if (e.isAfter(today, 'day')) e = today;
    if (s.isAfter(e, 'day')) s = e;
    return { date: e.format(D), periodStart: s.isSame(e, 'day') ? null : s.format(D) };
}

/** "09/11 – 15/11/2026" hoặc "15/11/2026" (kỳ 1 ngày). */
export function formatPeriod(date: string, periodStart: string | null | undefined): string {
    const e = dayjs(date);
    if (!periodStart || periodStart === date) return e.format('DD/MM/YYYY');
    const s = dayjs(periodStart);
    return `${s.format(s.year() === e.year() ? 'DD/MM' : 'DD/MM/YYYY')} – ${e.format('DD/MM/YYYY')}`;
}
