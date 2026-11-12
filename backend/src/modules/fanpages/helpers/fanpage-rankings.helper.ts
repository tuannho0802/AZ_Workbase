import { weekEndOf, weekStartOf } from './fanpage-cadence.helper';
import { postUrlKey } from './fanpage-url.helper';

/**
 * Xếp hạng đóng góp của người phụ trách Page (B5) - HÀM THUẦN theo PLAN 3.8, không chạm DB/đồng hồ (có spec).
 *
 * Quy tắc cốt lõi:
 *  - (U, P) đủ điều kiện khi U là người phụ trách của P VÀ có ĐÓNG GÓP DỮ LIỆU trên P trong kỳ:
 *      (a) bài do CHÍNH U ghi (`created_by_id`), có ngày đăng trong kỳ, KHÔNG phải bài trùng URL (bài id nhỏ nhất thắng);
 *      (b) lần nhập số liệu do CHÍNH U tạo - mỗi (Page, ngày) tính 1 (sửa lại không tính thêm, vì upsert giữ nguyên người tạo).
 *  - Người nhập hộ nhưng không phụ trách Page đó: KHÔNG lên hạng; số bài của họ chỉ được đếm riêng (`nonOwnerPostsByUser`) cho chú thích.
 *  - Người không có đóng góp nào trong kỳ -> không có dòng (không hiện hạng 0).
 *  - KHÔNG có điểm tổng hợp ẩn, không khách, không tiền.
 *  - \"% tuần đạt nhịp\": chỉ xét các TUẦN ĐÃ KẾT THÚC nằm trọn trong kỳ (tuần dở dang ở đầu/cuối kỳ hoặc tuần hiện tại sẽ bị đánh trượt oan),
 *    trên Page có đặt mục tiêu tuần, và U có đóng góp trên Page đó trong tuần ấy. Đạt = tổng bài (mọi người, đã bỏ trùng) của Page tuần đó >= mục tiêu.
 *    Page nhiều người phụ trách: mọi người đã đóng góp trong tuần đó đều được tính cùng kết quả.
 */

export interface RankPage {
    id: number;
    /** `target_posts_per_week` hoặc null. */
    target: number | null;
    ownerIds: ReadonlyArray<number>;
}

export interface RankPost {
    id: number;
    fanpageId: number;
    url: string;
    postedDate: string | null;
    createdById: number | null;
}

export interface RankSnapshot {
    fanpageId: number;
    snapshotDate: string;
    createdById: number | null;
}

export interface UserContribution {
    userId: number;
    posts: number;
    snapshots: number;
    pageIds: Set<number>;
    weeksTracked: number;
    weeksOnTarget: number;
}

export interface RankingAggregateInput {
    /** CHỈ Page đang theo dõi (`isTracked`) - người gọi tự lọc. */
    pages: ReadonlyArray<RankPage>;
    posts: ReadonlyArray<RankPost>;
    snapshots: ReadonlyArray<RankSnapshot>;
    from: string;
    to: string;
    today: string;
}

export interface RankingAggregate {
    byUser: Map<number, UserContribution>;
    /** Số bài (đã bỏ trùng, trong kỳ) do người KHÔNG phụ trách Page đó ghi - theo từng người ghi. */
    nonOwnerPostsByUser: Map<number, number>;
}

const inRange = (d: string | null | undefined, from: string, to: string): d is string => !!d && d >= from && d <= to;

export function aggregateContributions(input: RankingAggregateInput): RankingAggregate {
    const { from, to, today } = input;
    const pageById = new Map(input.pages.map((p) => [p.id, p]));
    const byUser = new Map<number, UserContribution>();
    const nonOwnerPostsByUser = new Map<number, number>();

    const userOf = (id: number): UserContribution => {
        let u = byUser.get(id);
        if (!u) {
            u = { userId: id, posts: 0, snapshots: 0, pageIds: new Set(), weeksTracked: 0, weeksOnTarget: 0 };
            byUser.set(id, u);
        }
        return u;
    };

    // Tuần mà (người, Page) có đóng góp: khoá `user|page|weekStart`.
    const activity = new Set<string>();
    const pageWeekPosts = new Map<string, number>();

    // 1) Bài: lọc kỳ + Page đang theo dõi, bỏ trùng URL trong Page (id nhỏ nhất thắng).
    const candidates = input.posts
        .filter((p) => pageById.has(p.fanpageId) && inRange(p.postedDate, from, to))
        .sort((a, b) => a.id - b.id);
    const seenUrl = new Set<string>();
    for (const post of candidates) {
        const key = `${post.fanpageId}|${postUrlKey(post.url)}`;
        if (seenUrl.has(key)) continue;
        seenUrl.add(key);

        const week = weekStartOf(post.postedDate as string);
        const pw = `${post.fanpageId}|${week}`;
        pageWeekPosts.set(pw, (pageWeekPosts.get(pw) ?? 0) + 1);

        if (post.createdById == null) continue; // người ghi đã bị xoá: không có ai để ghi công
        const page = pageById.get(post.fanpageId) as RankPage;
        if (page.ownerIds.includes(post.createdById)) {
            const u = userOf(post.createdById);
            u.posts += 1;
            u.pageIds.add(page.id);
            activity.add(`${post.createdById}|${page.id}|${week}`);
        } else {
            nonOwnerPostsByUser.set(post.createdById, (nonOwnerPostsByUser.get(post.createdById) ?? 0) + 1);
        }
    }

    // 2) Số liệu định kỳ: mỗi (Page, ngày) tính 1.
    const seenSnap = new Set<string>();
    for (const s of input.snapshots) {
        const page = pageById.get(s.fanpageId);
        if (!page || s.createdById == null || !inRange(s.snapshotDate, from, to)) continue;
        const key = `${s.fanpageId}|${s.snapshotDate}`;
        if (seenSnap.has(key)) continue;
        seenSnap.add(key);
        if (!page.ownerIds.includes(s.createdById)) continue; // nhập hộ: vẫn lưu ở thống kê Page, không lên hạng
        const u = userOf(s.createdById);
        u.snapshots += 1;
        u.pageIds.add(page.id);
        activity.add(`${s.createdById}|${page.id}|${weekStartOf(s.snapshotDate)}`);
    }

    // 3) % tuần đạt nhịp - chỉ tuần đã kết thúc, nằm trọn trong kỳ, Page có mục tiêu.
    const lastCountableDay = to < today ? to : today;
    for (const act of activity) {
        const [uid, pid, weekStart] = act.split('|');
        const page = pageById.get(Number(pid)) as RankPage;
        if (page.target == null) continue;
        if (weekStart < from || weekEndOf(weekStart) > lastCountableDay) continue;
        const u = userOf(Number(uid));
        u.weeksTracked += 1;
        if ((pageWeekPosts.get(`${pid}|${weekStart}`) ?? 0) >= page.target) u.weeksOnTarget += 1;
    }

    return { byUser, nonOwnerPostsByUser };
}

export interface RankingRowBase {
    userId: number;
    posts: number;
    snapshots: number;
    pages: number;
    weeksTracked: number;
    weeksOnTarget: number;
    /** 0-100 làm tròn; null = chưa có tuần nào để xét (Page không đặt mục tiêu / chưa hết tuần). */
    targetRate: number | null;
    /** Hạng THEO SỐ BÀI trong tập người xem được thấy (đồng hạng chung số: 1,1,3). */
    rank: number;
}

/**
 * Dựng các dòng xếp hạng CHỈ trong tập người xem được thấy (`visibleIds`) - thứ hạng không lộ vị trí so với người ngoài phạm vi.
 * Sắp xếp mặc định: Số bài ↓, Số lần nhập số liệu ↓, userId ↑ (ổn định).
 */
export function buildRankingRows(byUser: ReadonlyMap<number, UserContribution>, visibleIds: ReadonlySet<number>): RankingRowBase[] {
    const list = [...byUser.values()].filter((u) => visibleIds.has(u.userId) && u.posts + u.snapshots > 0);
    list.sort((a, b) => b.posts - a.posts || b.snapshots - a.snapshots || a.userId - b.userId);

    const rows: RankingRowBase[] = [];
    list.forEach((u, i) => {
        const prev = rows[i - 1];
        const rank = prev && list[i - 1].posts === u.posts ? prev.rank : i + 1;
        rows.push({
            userId: u.userId,
            posts: u.posts,
            snapshots: u.snapshots,
            pages: u.pageIds.size,
            weeksTracked: u.weeksTracked,
            weeksOnTarget: u.weeksOnTarget,
            targetRate: u.weeksTracked > 0 ? Math.round((u.weeksOnTarget / u.weeksTracked) * 100) : null,
            rank,
        });
    });
    return rows;
}

/** Tổng số bài \"người không phụ trách ghi\" của những người trong tập xem được (chú thích cuối bảng). */
export function sumNonOwnerPosts(map: ReadonlyMap<number, number>, visibleIds: ReadonlySet<number>): number {
    let n = 0;
    for (const [uid, c] of map) if (visibleIds.has(uid)) n += c;
    return n;
}