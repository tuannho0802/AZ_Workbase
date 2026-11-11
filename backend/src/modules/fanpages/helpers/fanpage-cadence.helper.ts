import { addDays, spanDays } from '../../utms/helpers/utm-stats.helper';

/**
 * Luật "nhịp đăng bài" của Fanpage - HÀM THUẦN (không DB, không đồng hồ hệ thống), mirror `utm-stats.helper.ts`.
 * Nguồn sự thật DUY NHẤT (PLAN_FANPAGE_ANALYTICS mục 3.1-3.2): thẻ KPI, cột danh sách, nhắc việc, tab "Hôm nay", badge
 * đều đọc kết quả của file này, FE KHÔNG tự tính lại.
 *
 * Mọi ngày là chuỗi `YYYY-MM-DD` theo giờ VN; "hôm nay" do NGƯỜI GỌI truyền vào (`todayVnStr()`), KHÔNG dùng `new Date()`
 * ở đây (tránh lệch múi giờ - SKILL_DATABASE_MANAGEMENT §6).
 */

export type CadenceState = 'paused' | 'new' | 'silent' | 'at_risk' | 'ok';

/** Ngưỡng "im lặng" mặc định (setting `fanpage.silent_days`). */
export const FANPAGE_SILENT_DAYS_DEFAULT = 3;
export const FANPAGE_SILENT_DAYS_MIN = 1;
export const FANPAGE_SILENT_DAYS_MAX = 30;
/** Số ngày tối đa tra ngược khi tính streak (streak hiển thị tối đa "30+"). */
export const FANPAGE_STREAK_CAP = 30;
/** Cửa sổ "Bài 30 ngày" (gồm cả hôm nay). */
export const FANPAGE_POSTS_WINDOW_DAYS = 30;

export interface TrackedInput {
    isActive: boolean;
    archivedAt: Date | string | null | undefined;
    /** Cờ `is_blocking` của tình trạng Page; null/undefined = chưa có tình trạng (coi như không chặn). */
    healthIsBlocking: boolean | null | undefined;
}

/**
 * isTracked = is_active = 1 AND archived_at IS NULL AND (health.is_blocking = 0 OR health IS NULL)  (PLAN 3.1).
 * Chỉ Page isTracked mới được tính vào "tổng Page", "im lặng", "nguy cơ", "Hôm nay", badge, nhắc việc.
 */
export function isTrackedPage(p: TrackedInput): boolean {
    return p.isActive === true && (p.archivedAt == null) && p.healthIsBlocking !== true;
}

/** Đọc setting `fanpage.silent_days`: số nguyên 1-30; thiếu/hỏng/ngoài khoảng -> mặc định 3. */
export function parseSilentDays(raw: string | number | null | undefined): number {
    if (raw == null) return FANPAGE_SILENT_DAYS_DEFAULT;
    const text = String(raw).trim();
    if (!/^\d+$/.test(text)) return FANPAGE_SILENT_DAYS_DEFAULT;
    const n = Number(text);
    return n >= FANPAGE_SILENT_DAYS_MIN && n <= FANPAGE_SILENT_DAYS_MAX ? n : FANPAGE_SILENT_DAYS_DEFAULT;
}

/** Thứ trong tuần theo quy ước ISO: Thứ Hai = 1 ... Chủ Nhật = 7 (không phụ thuộc múi giờ máy chủ). */
export function isoWeekday(date: string): number {
    const [y, m, d] = date.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // CN=0
    return dow === 0 ? 7 : dow;
}

/** Ngày Thứ Hai của tuần chứa `date` (Q3: tuần Thứ Hai -> Chủ Nhật, giờ VN). */
export function weekStartOf(date: string): string {
    return addDays(date, -(isoWeekday(date) - 1));
}

/** Ngày Chủ Nhật của tuần chứa `date`. */
export function weekEndOf(date: string): string {
    return addDays(weekStartOf(date), 6);
}

/** Số ngày còn lại của tuần TÍNH CẢ HÔM NAY (Thứ Hai = 7, Chủ Nhật = 1). */
export function daysLeftInWeek(today: string): number {
    return 8 - isoWeekday(today);
}

/** Ngày đầu của cửa sổ N ngày gần nhất (gồm cả `today`). */
export function windowStartOf(today: string, days: number): string {
    return addDays(today, -(days - 1));
}

/** Số ngày từ `from` đến `to` (to >= from -> >= 0; to < from -> âm). */
export function daysBetween(from: string, to: string): number {
    return spanDays(from, to) - 1;
}

/**
 * Streak = số ngày LIÊN TIẾP có bài tính đến hôm nay. Hôm nay chưa đăng -> tính đến hôm qua và CHƯA bị đứt
 * (người dùng vẫn còn cả ngày để đăng). Tối đa `cap` (mặc định 30). `postDates` có thể trùng/không sắp xếp.
 */
export function computeStreak(today: string, postDates: Iterable<string>, cap: number = FANPAGE_STREAK_CAP): number {
    const set = new Set(postDates);
    const start = set.has(today) ? today : addDays(today, -1);
    let n = 0;
    while (n < cap && set.has(addDays(start, -n))) n++;
    return n;
}

export interface CadenceInput {
    /** `todayVnStr()`. */
    today: string;
    isTracked: boolean;
    /** Ngày đăng gần nhất (bài CÓ posted_date). Bài không có ngày KHÔNG tính (PLAN 3.3). */
    lastPostDate: string | null;
    /** Số bài có posted_date trong tuần Thứ Hai-CN hiện tại. */
    weekCount: number;
    /** `target_posts_per_week` hoặc null. */
    target: number | null;
    silentDays: number;
    /** Ngày tạo Page theo giờ VN (`toVnDateStr(createdAt)`). */
    createdDate: string;
    /** Ngày có bài trong ~30 ngày gần nhất - chỉ để tính streak. */
    recentPostDates?: Iterable<string>;
}

export interface CadenceResult {
    state: CadenceState;
    daysSinceLastPost: number | null;
    weekCount: number;
    target: number | null;
    streak: number;
    postedToday: boolean;
}

/**
 * Trạng thái nhịp đăng - ưu tiên từ trên xuống, dừng ở dòng khớp đầu tiên (PLAN 3.2):
 *   1 !isTracked -> paused | 2 Page mới (< silentDays ngày, chưa có bài) -> new
 *   3 chưa từng đăng (quá ân hạn) hoặc cách >= silentDays ngày -> silent
 *   4 có target, còn thiếu `need` bài mà need >= số ngày còn lại của tuần -> at_risk | 5 -> ok
 */
export function computeCadence(i: CadenceInput): CadenceResult {
    const { today, lastPostDate } = i;
    // Ngày đăng ở tương lai (nhập nhầm) không được cho ra "cách -1 ngày": kẹp về 0.
    const daysSince = lastPostDate == null ? null : Math.max(0, daysBetween(lastPostDate, today));
    const postedToday = lastPostDate === today;
    const base = {
        daysSinceLastPost: daysSince,
        weekCount: i.weekCount,
        target: i.target,
        streak: computeStreak(today, i.recentPostDates ?? (lastPostDate ? [lastPostDate] : [])),
        postedToday,
    };

    if (!i.isTracked) return { ...base, state: 'paused' };

    if (lastPostDate == null && daysBetween(i.createdDate, today) < i.silentDays) return { ...base, state: 'new' };

    if (lastPostDate == null || (daysSince as number) >= i.silentDays) return { ...base, state: 'silent' };

    if (i.target != null) {
        const need = i.target - i.weekCount;
        if (need > 0 && need >= daysLeftInWeek(today)) return { ...base, state: 'at_risk' };
    }
    return { ...base, state: 'ok' };
}