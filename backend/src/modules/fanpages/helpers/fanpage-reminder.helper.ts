import { daysBetween } from './fanpage-cadence.helper';

/**
 * Luật nhắc việc Fanpage - HÀM THUẦN (PLAN 9). Không DB, không đồng hồ: người gọi truyền `today`/giờ VN.
 */

/** Chỉ nhắc TỪ giờ này (giờ VN) - người phụ trách đã có cả ngày để đăng bài. */
export const FANPAGE_REMINDER_START_HOUR_VN = 17;

/** Các mốc nhắc \"im lặng\" cố định (ngày chưa đăng); mốc đầu luôn là ngưỡng `silentDays` của hệ thống (nếu nhỏ hơn). */
export const FANPAGE_SILENT_MILESTONES = [3, 7, 14, 30] as const;

export function isReminderHour(nowVnHour: number): boolean {
    return nowVnHour >= FANPAGE_REMINDER_START_HOUR_VN;
}

/** Danh sách mốc hiệu lực: `silentDays` + các mốc cố định lớn hơn nó, sắp tăng dần, không trùng. */
export function silentMilestones(silentDays: number): number[] {
    const set = new Set<number>([silentDays]);
    for (const m of FANPAGE_SILENT_MILESTONES) if (m > silentDays) set.add(m);
    return [...set].sort((a, b) => a - b);
}

/**
 * Mốc CAO NHẤT đã đạt (<= số ngày im lặng). Chưa đạt mốc đầu -> null. Cron lỡ nhiều ngày vẫn chỉ nhắc đúng 1 lần (mốc cao nhất).
 * Ví dụ silentDays=3: 2 ngày -> null · 3-6 -> 3 · 7-13 -> 7 · 14-29 -> 14 · >= 30 -> 30.
 */
export function currentSilentMilestone(silentDaysCount: number, silentDays: number): number | null {
    let hit: number | null = null;
    for (const m of silentMilestones(silentDays)) if (silentDaysCount >= m) hit = m;
    return hit;
}

/** Số ngày im lặng để so mốc: kể từ bài gần nhất; Page chưa có bài nào -> kể từ ngày tạo Page. */
export function effectiveSilentDays(today: string, lastPostDate: string | null, createdDate: string): number {
    return Math.max(0, daysBetween(lastPostDate ?? createdDate, today));
}

/**
 * Khoá chống trùng của `fanpage.silent`: gắn cả MỐC lẫn \"điểm neo\" (ngày bài gần nhất, hoặc ngày tạo Page nếu chưa từng đăng).
 * Nhờ điểm neo, sau khi Page đăng lại rồi im lặng lần nữa thì được nhắc lại (neo khác); trong CÙNG đợt im lặng mỗi mốc đúng 1 lần.
 */
export function silentDedupeSuffix(anchorDate: string, milestone: number): string {
    return `${anchorDate}:m${milestone}`;
}