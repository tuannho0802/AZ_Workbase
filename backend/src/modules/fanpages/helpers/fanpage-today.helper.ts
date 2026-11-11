import { CadenceState } from './fanpage-cadence.helper';

/**
 * Phân nhóm Page cho tab "Hôm nay" + badge sidebar - HÀM THUẦN (PLAN 8.4, X2/X16).
 * Cùng đọc `cadence.state` đã tính ở `fanpage-cadence.helper` (FE KHÔNG tự tính lại).
 *
 * - `needAction`  : Page theo dõi, CHƯA đăng hôm nay, state `silent` hoặc `at_risk`.
 * - `postedToday` : Page theo dõi ĐÃ có bài hôm nay (chỉ cần MỘT người phụ trách đăng là Page rời `needAction` của tất cả - PLAN 3.4).
 * - `ok`          : Page theo dõi còn lại (`ok`, `new`) - hiện thu gọn.
 * Page không theo dõi (`paused`) KHÔNG xuất hiện ở đâu cả.
 */
export type TodayGroup = 'needAction' | 'postedToday' | 'ok';

export interface TodayClassifiable {
    isTracked: boolean;
    cadence: {
        state: CadenceState;
        daysSinceLastPost: number | null;
        weekCount: number;
        target: number | null;
        postedToday: boolean;
    };
}

export function classifyToday(p: TodayClassifiable): TodayGroup | null {
    if (!p.isTracked || p.cadence.state === 'paused') return null;
    if (p.cadence.postedToday) return 'postedToday';
    if (p.cadence.state === 'silent' || p.cadence.state === 'at_risk') return 'needAction';
    return 'ok';
}

/** Số bài còn thiếu để đạt mục tiêu tuần (>= 0; không đặt mục tiêu = 0). */
export function postsNeeded(c: Pick<TodayClassifiable['cadence'], 'target' | 'weekCount'>): number {
    return c.target == null ? 0 : Math.max(0, c.target - c.weekCount);
}

/**
 * Thứ tự khẩn cấp trong nhóm `needAction`: `silent` trước `at_risk`;
 * `silent`: chưa từng đăng (daysSince = null) trước, rồi số ngày im lặng GIẢM dần;
 * `at_risk`: thiếu nhiều bài hơn trước. Ngang nhau -> ổn định theo thứ tự đầu vào (Array.sort ổn định từ ES2019).
 */
export function compareNeedAction(a: TodayClassifiable, b: TodayClassifiable): number {
    const rank = (x: TodayClassifiable) => (x.cadence.state === 'silent' ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.cadence.state === 'silent') {
        const da = a.cadence.daysSinceLastPost ?? Number.POSITIVE_INFINITY;
        const db = b.cadence.daysSinceLastPost ?? Number.POSITIVE_INFINITY;
        return db === da ? 0 : db > da ? 1 : -1;
    }
    return postsNeeded(b.cadence) - postsNeeded(a.cadence);
}

export interface TodayGroups<T> {
    needAction: T[];
    postedToday: T[];
    ok: T[];
}

/** Chia danh sách thành 3 nhóm; `needAction` đã sắp theo mức khẩn. Không đổi mảng đầu vào. */
export function groupToday<T extends TodayClassifiable>(items: ReadonlyArray<T>): TodayGroups<T> {
    const out: TodayGroups<T> = { needAction: [], postedToday: [], ok: [] };
    for (const it of items) {
        const g = classifyToday(it);
        if (g) out[g].push(it);
    }
    out.needAction.sort(compareNeedAction);
    return out;
}