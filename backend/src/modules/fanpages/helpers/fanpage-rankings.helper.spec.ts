import { aggregateContributions, buildRankingRows, sumNonOwnerPosts, RankPost, RankSnapshot, UserContribution } from './fanpage-rankings.helper';

// Mốc ngày (giờ VN): 2026-10-05, 10-12, 10-19, 10-26, 11-02, 11-09 đều là Thứ Hai.
const RANGE = { from: '2026-10-05', to: '2026-11-08', today: '2026-11-12' }; // 5 tuần trọn vẹn, đã kết thúc

let nextId = 1;
const post = (fanpageId: number, createdById: number | null, postedDate: string | null, url?: string): RankPost => ({
    id: nextId++,
    fanpageId,
    url: url ?? `https://fb.com/p${fanpageId}/posts/${nextId}`,
    postedDate,
    createdById,
});
const snap = (fanpageId: number, snapshotDate: string, createdById: number | null): RankSnapshot => ({ fanpageId, snapshotDate, createdById });

const run = (over: Partial<Parameters<typeof aggregateContributions>[0]> & { pages: Parameters<typeof aggregateContributions>[0]['pages'] }) =>
    aggregateContributions({ posts: [], snapshots: [], ...RANGE, ...over });

describe('aggregateContributions - điều kiện xếp hạng (PLAN 3.8)', () => {
    beforeEach(() => {
        nextId = 1;
    });

    it('người phụ trách ghi bài trong kỳ -> có đóng góp; đếm số bài + số Page', () => {
        const r = run({
            pages: [
                { id: 1, target: null, ownerIds: [10] },
                { id: 2, target: null, ownerIds: [10] },
            ],
            posts: [post(1, 10, '2026-10-06'), post(1, 10, '2026-10-07'), post(2, 10, '2026-10-08')],
        });
        const u = r.byUser.get(10) as UserContribution;
        expect(u.posts).toBe(3);
        expect(u.pageIds.size).toBe(2);
    });

    it('người NHẬP HỘ (không phụ trách Page) không lên hạng, chỉ được đếm vào nonOwnerPosts', () => {
        const r = run({
            pages: [{ id: 1, target: null, ownerIds: [10] }],
            posts: [post(1, 99, '2026-10-06'), post(1, 99, '2026-10-07'), post(1, 10, '2026-10-08')],
        });
        expect(r.byUser.has(99)).toBe(false);
        expect(r.nonOwnerPostsByUser.get(99)).toBe(2);
        expect(r.byUser.get(10)?.posts).toBe(1);
    });

    it('bài TRÙNG URL trong cùng Page chỉ tính 1 lần (bài id nhỏ nhất thắng, kể cả khác người ghi)', () => {
        const r = run({
            pages: [{ id: 1, target: null, ownerIds: [10, 11] }],
            posts: [
                { id: 5, fanpageId: 1, url: 'https://fb.com/p/1/?fbclid=x', postedDate: '2026-10-06', createdById: 10 },
                { id: 9, fanpageId: 1, url: 'https://www.fb.com/p/1', postedDate: '2026-10-07', createdById: 11 },
            ],
        });
        expect(r.byUser.get(10)?.posts).toBe(1);
        expect(r.byUser.has(11)).toBe(false);
    });

    it('cùng URL nhưng KHÁC Page -> cả hai đều tính', () => {
        const r = run({
            pages: [
                { id: 1, target: null, ownerIds: [10] },
                { id: 2, target: null, ownerIds: [10] },
            ],
            posts: [post(1, 10, '2026-10-06', 'https://x.com/a'), post(2, 10, '2026-10-06', 'https://x.com/a')],
        });
        expect(r.byUser.get(10)?.posts).toBe(2);
    });

    it('bài ngoài kỳ, bài chưa có ngày, bài của Page không theo dõi, bài người ghi đã bị xoá -> không ai được tính', () => {
        const r = run({
            pages: [{ id: 1, target: null, ownerIds: [10] }],
            posts: [post(1, 10, '2026-10-04'), post(1, 10, '2026-11-09'), post(1, 10, null), post(3, 10, '2026-10-06'), post(1, null, '2026-10-06')],
        });
        expect(r.byUser.size).toBe(0);
        expect(r.nonOwnerPostsByUser.size).toBe(0);
    });

    it('số liệu định kỳ: mỗi (Page, ngày) tính 1 - dòng lặp / sửa lại KHÔNG tính thêm', () => {
        const r = run({
            pages: [{ id: 1, target: null, ownerIds: [10] }],
            snapshots: [snap(1, '2026-10-06', 10), snap(1, '2026-10-06', 10), snap(1, '2026-10-13', 10)],
        });
        expect(r.byUser.get(10)?.snapshots).toBe(2);
    });

    it('số liệu do người nhập hộ tạo -> không lên hạng; người tạo đã xoá -> bỏ qua', () => {
        const r = run({
            pages: [{ id: 1, target: null, ownerIds: [10] }],
            snapshots: [snap(1, '2026-10-06', 99), snap(1, '2026-10-07', null)],
        });
        expect(r.byUser.size).toBe(0);
    });

    it('chỉ có số liệu (0 bài) vẫn là có đóng góp', () => {
        const r = run({ pages: [{ id: 1, target: null, ownerIds: [10] }], snapshots: [snap(1, '2026-10-06', 10)] });
        const u = r.byUser.get(10) as UserContribution;
        expect([u.posts, u.snapshots]).toEqual([0, 1]);
    });
});

describe('aggregateContributions - % tuần đạt nhịp', () => {
    beforeEach(() => {
        nextId = 1;
    });

    it('Page có mục tiêu 2 bài/tuần: tuần đủ 2 bài = đạt, tuần chỉ 1 bài = trượt', () => {
        const r = run({
            pages: [{ id: 1, target: 2, ownerIds: [10] }],
            posts: [post(1, 10, '2026-10-05'), post(1, 10, '2026-10-06'), post(1, 10, '2026-10-12')],
        });
        const u = r.byUser.get(10) as UserContribution;
        expect([u.weeksTracked, u.weeksOnTarget]).toEqual([2, 1]);
    });

    it('Page không đặt mục tiêu -> không có tuần nào để xét (targetRate sẽ là null)', () => {
        const r = run({ pages: [{ id: 1, target: null, ownerIds: [10] }], posts: [post(1, 10, '2026-10-06')] });
        expect(r.byUser.get(10)?.weeksTracked).toBe(0);
    });

    it('Page nhiều người phụ trách: bài của cả hai cộng vào nhịp Page, MỌI người đóng góp trong tuần đó đều được tính đạt', () => {
        const r = run({
            pages: [{ id: 1, target: 2, ownerIds: [10, 11] }],
            posts: [post(1, 10, '2026-10-06'), post(1, 11, '2026-10-07')],
        });
        expect(r.byUser.get(10)).toMatchObject({ weeksTracked: 1, weeksOnTarget: 1 });
        expect(r.byUser.get(11)).toMatchObject({ weeksTracked: 1, weeksOnTarget: 1 });
    });

    it('người không đóng góp trong tuần đó không được hưởng kết quả của tuần đó', () => {
        const r = run({
            pages: [{ id: 1, target: 1, ownerIds: [10, 11] }],
            posts: [post(1, 10, '2026-10-06'), post(1, 11, '2026-10-13')],
        });
        expect(r.byUser.get(10)?.weeksTracked).toBe(1); // chỉ tuần 10-05
        expect(r.byUser.get(11)?.weeksTracked).toBe(1); // chỉ tuần 10-12
    });

    it('tuần dở dang ở đầu kỳ và tuần hiện tại chưa kết thúc KHÔNG bị tính trượt oan', () => {
        // kỳ bắt đầu giữa tuần (Thứ Tư 10-07) -> tuần 10-05 không trọn trong kỳ; today giữa tuần 11-09 -> tuần đó chưa hết.
        const r = aggregateContributions({
            pages: [{ id: 1, target: 5, ownerIds: [10] }],
            posts: [post(1, 10, '2026-10-08'), post(1, 10, '2026-11-10')],
            snapshots: [],
            from: '2026-10-07',
            to: '2026-11-12',
            today: '2026-11-12',
        });
        expect(r.byUser.get(10)).toMatchObject({ posts: 2, weeksTracked: 0, weeksOnTarget: 0 });
    });

    it('bài trùng URL không làm Page "đủ bài" giả', () => {
        const r = run({
            pages: [{ id: 1, target: 2, ownerIds: [10] }],
            posts: [post(1, 10, '2026-10-05', 'https://a.com/1'), post(1, 10, '2026-10-06', 'https://a.com/1/')],
        });
        expect(r.byUser.get(10)).toMatchObject({ weeksTracked: 1, weeksOnTarget: 0 });
    });
});

describe('buildRankingRows - hạng trong tập người xem được thấy', () => {
    const agg = (rows: Array<[number, number, number]>): Map<number, UserContribution> =>
        new Map(rows.map(([userId, posts, snapshots]) => [userId, { userId, posts, snapshots, pageIds: new Set([1]), weeksTracked: 0, weeksOnTarget: 0 }]));

    it('sắp theo Số bài ↓ rồi Số lần nhập ↓; đồng hạng chung số (1,1,3)', () => {
        const rows = buildRankingRows(agg([[1, 5, 0], [2, 5, 3], [3, 2, 9]]), new Set([1, 2, 3]));
        expect(rows.map((r) => [r.userId, r.rank])).toEqual([[2, 1], [1, 1], [3, 3]]);
    });

    it('thứ hạng chỉ tính trong tập được thấy: người ngoài phạm vi KHÔNG đẩy hạng của người trong phạm vi', () => {
        const rows = buildRankingRows(agg([[1, 50, 0], [2, 5, 0], [3, 4, 0]]), new Set([2, 3]));
        expect(rows.map((r) => [r.userId, r.rank])).toEqual([[2, 1], [3, 2]]);
    });

    it('phạm vi own: chỉ còn dòng của chính mình (hạng 1)', () => {
        const rows = buildRankingRows(agg([[1, 50, 0], [2, 5, 0]]), new Set([2]));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ userId: 2, rank: 1 });
    });

    it('người không có đóng góp (hoặc ngoài tập xem) không có dòng; không có hạng 0', () => {
        expect(buildRankingRows(agg([[1, 0, 0]]), new Set([1]))).toEqual([]);
        expect(buildRankingRows(agg([]), new Set([1]))).toEqual([]);
    });

    it('targetRate làm tròn %; null khi chưa có tuần nào để xét; số Page đếm distinct', () => {
        const m = new Map<number, UserContribution>([
            [1, { userId: 1, posts: 3, snapshots: 0, pageIds: new Set([1, 2]), weeksTracked: 3, weeksOnTarget: 2 }],
            [2, { userId: 2, posts: 1, snapshots: 0, pageIds: new Set([1]), weeksTracked: 0, weeksOnTarget: 0 }],
        ]);
        const rows = buildRankingRows(m, new Set([1, 2]));
        expect(rows[0]).toMatchObject({ userId: 1, pages: 2, targetRate: 67 });
        expect(rows[1]).toMatchObject({ userId: 2, targetRate: null });
    });

    it('không lộ tiền/khách: dòng chỉ chứa các cột đóng góp dữ liệu', () => {
        const [row] = buildRankingRows(agg([[1, 1, 1]]), new Set([1]));
        expect(Object.keys(row).sort()).toEqual(['pages', 'posts', 'rank', 'snapshots', 'targetRate', 'userId', 'weeksOnTarget', 'weeksTracked']);
    });
});

describe('sumNonOwnerPosts', () => {
    it('chỉ cộng người trong tập xem được', () => {
        const m = new Map([[1, 4], [2, 6]]);
        expect(sumNonOwnerPosts(m, new Set([1]))).toBe(4);
        expect(sumNonOwnerPosts(m, new Set([1, 2]))).toBe(10);
        expect(sumNonOwnerPosts(m, new Set())).toBe(0);
    });
});