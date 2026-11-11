import type { FanpageCadence, FanpageCadenceState } from '../api/fanpages.api';

/**
 * Chỉ HIỂN THỊ nhịp đăng - trạng thái do BE tính. KHÔNG tính lại `state` ở FE.
 * Màu luôn đi kèm icon + chữ (không dựa vào màu đơn độc).
 */
export const CADENCE_META: Record<FanpageCadenceState, { label: string; color: string; icon: string }> = {
    paused: { label: 'Tạm ngừng', color: 'default', icon: '⏸' },
    new: { label: 'Mới', color: 'blue', icon: '✦' },
    silent: { label: 'Im lặng', color: 'red', icon: '⚠' },
    at_risk: { label: 'Nguy cơ trễ', color: 'orange', icon: '◔' },
    ok: { label: 'Ổn', color: 'green', icon: '✓' },
};

/** "3/5" khi có mục tiêu, "3" khi không đặt mục tiêu. */
export function formatWeekProgress(c: Pick<FanpageCadence, 'weekCount' | 'target'>): string {
    return c.target == null ? String(c.weekCount) : `${c.weekCount}/${c.target}`;
}

/** "Hôm nay" / "Hôm qua" / "5 ngày trước" / "Chưa có bài". */
export function formatSinceLastPost(c: Pick<FanpageCadence, 'daysSinceLastPost'>): string {
    const d = c.daysSinceLastPost;
    if (d == null) return 'Chưa có bài';
    if (d <= 0) return 'Hôm nay';
    if (d === 1) return 'Hôm qua';
    return `${d} ngày trước`;
}

/** Số bài còn thiếu để đạt mục tiêu tuần (>= 0; không đặt mục tiêu = 0). */
export function postsNeeded(c: Pick<FanpageCadence, 'weekCount' | 'target'>): number {
    return c.target == null ? 0 : Math.max(0, c.target - c.weekCount);
}

/** Streak BE chặn trần 30 -> hiện "30+" cho khỏi hiểu nhầm là đúng 30. */
export function formatStreak(streak: number): string {
    return streak >= 30 ? '30+' : String(streak);
}
