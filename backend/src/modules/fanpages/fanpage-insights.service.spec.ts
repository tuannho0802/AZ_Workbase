import { buildInsights, EMPTY_AGGREGATE, FANPAGE_BATCH_SIZE, FanpageInsightsService, isOrphanPage, RawPostAggregate } from './fanpage-insights.service';

// 2026-11-11 = Thứ Tư. Tuần Thứ Hai-CN: 2026-11-09 -> 2026-11-15. Cửa sổ 30 ngày: 2026-10-13 -> 2026-11-11.
const TODAY = '2026-11-11';
const page = (over: Record<string, unknown> = {}) => ({
    isActive: true,
    archivedAt: null,
    targetPostsPerWeek: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    owners: [{ isActive: true }],
    healthStatus: { isBlocking: false },
    ...over,
});
const agg = (over: Partial<RawPostAggregate> = {}): RawPostAggregate => ({ ...EMPTY_AGGREGATE, ...over });

describe('isOrphanPage', () => {
    it('chưa có ai -> mồ côi', () => {
        expect(isOrphanPage([])).toBe(true);
        expect(isOrphanPage(undefined)).toBe(true);
        expect(isOrphanPage(null)).toBe(true);
    });
    it('tất cả người phụ trách đã khoá/nghỉ -> mồ côi', () => {
        expect(isOrphanPage([{ isActive: false }, { isActive: false }])).toBe(true);
    });
    it('còn ít nhất 1 người hoạt động -> không mồ côi', () => {
        expect(isOrphanPage([{ isActive: false }, { isActive: true }])).toBe(false);
    });
    it('trường isActive không được nạp -> coi là còn hoạt động (không báo mồ côi nhầm)', () => {
        expect(isOrphanPage([{}])).toBe(false);
    });
});

describe('buildInsights', () => {
    const ctx = { today: TODAY, silentDays: 3 };

    it('Page bình thường, vừa đăng hôm qua -> tracked, ok', () => {
        const r = buildInsights(page() as never, agg({ postCount: 10, lastPostDate: '2026-11-10', posts30d: 8, weekCount: 2, recentPostDates: ['2026-11-10'] }), ctx);
        expect(r.isTracked).toBe(true);
        expect(r.isOrphan).toBe(false);
        expect(r.cadence.state).toBe('ok');
        expect(r.postCount).toBe(10);
        expect(r.posts30d).toBe(8);
    });
    it('không rò rỉ recentPostDates ra response', () => {
        const r = buildInsights(page() as never, agg({ recentPostDates: ['2026-11-10'] }), ctx);
        expect(r).not.toHaveProperty('recentPostDates');
    });
    it('Page đã lưu trữ -> không theo dõi -> paused', () => {
        const r = buildInsights(page({ archivedAt: new Date() }) as never, agg(), ctx);
        expect(r.isTracked).toBe(false);
        expect(r.cadence.state).toBe('paused');
    });
    it('tình trạng chặn (Bị khoá/Đã bỏ) -> paused dù đang is_active', () => {
        const r = buildInsights(page({ healthStatus: { isBlocking: true } }) as never, agg({ lastPostDate: '2026-11-11' }), ctx);
        expect(r.cadence.state).toBe('paused');
    });
    it('chưa có tình trạng (null) -> không chặn', () => {
        expect(buildInsights(page({ healthStatus: null }) as never, agg({ lastPostDate: TODAY }), ctx).isTracked).toBe(true);
    });
    it('lâu không đăng -> silent; có mục tiêu thiếu nhiều -> at_risk', () => {
        expect(buildInsights(page() as never, agg({ lastPostDate: '2026-11-01' }), ctx).cadence.state).toBe('silent');
        expect(buildInsights(page({ targetPostsPerWeek: 5 }) as never, agg({ lastPostDate: '2026-11-10', weekCount: 0 }), ctx).cadence.state).toBe('at_risk');
    });
    it('Page tạo cách đây 1 ngày, chưa có bài -> new (ngày tạo quy theo giờ VN)', () => {
        const r = buildInsights(page({ createdAt: new Date('2026-11-09T18:00:00Z') }) as never, agg(), ctx); // 10/11 01:00 giờ VN
        expect(r.cadence.state).toBe('new');
    });
    it('mồ côi độc lập với nhịp đăng', () => {
        const r = buildInsights(page({ owners: [] }) as never, agg({ lastPostDate: TODAY }), ctx);
        expect(r.isOrphan).toBe(true);
        expect(r.cadence.state).toBe('ok');
    });
});

function build(opts: { posts?: unknown[]; notes?: unknown[]; silent?: number } = {}) {
    const mkQb = (rows: unknown[]) => {
        const qb: Record<string, jest.Mock> = {};
        for (const m of ['select', 'addSelect', 'where', 'setParameters', 'groupBy']) qb[m] = jest.fn(() => qb);
        qb.getRawMany = jest.fn().mockResolvedValue(rows);
        return qb;
    };
    const postQb = mkQb(opts.posts ?? []);
    const noteQb = mkQb(opts.notes ?? []);
    const postRepo = { createQueryBuilder: jest.fn(() => postQb) };
    const noteRepo = { createQueryBuilder: jest.fn(() => noteQb) };
    const settings = { getSilentDays: jest.fn().mockResolvedValue(opts.silent ?? 3) };
    const svc = new FanpageInsightsService(postRepo as never, noteRepo as never, settings as never);
    return { svc, postRepo, noteRepo, postQb, noteQb, settings };
}

describe('FanpageInsightsService', () => {
    it('danh sách rỗng -> không chạy SQL nào', async () => {
        const { svc, postRepo, noteRepo } = build();
        const map = await svc.forPages([], TODAY);
        expect(map.size).toBe(0);
        expect(postRepo.createQueryBuilder).not.toHaveBeenCalled();
        expect(noteRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('đúng 2 truy vấn gộp (bài + ghi chú) cho 1 lô, truyền đúng mốc ngày', async () => {
        const { svc, postRepo, noteRepo, postQb } = build();
        await svc.forPages([{ id: 1, ...page() }, { id: 2, ...page() }] as never, TODAY);
        expect(postRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
        expect(noteRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
        expect(postQb.setParameters).toHaveBeenCalledWith({ today: TODAY, from30: '2026-10-13', weekStart: '2026-11-09', weekEnd: '2026-11-15' });
        expect(postQb.where).toHaveBeenCalledWith('p.fanpage_id IN (:...ids)', { ids: [1, 2] });
    });

    it('chia lô theo FANPAGE_BATCH_SIZE', async () => {
        const { svc, postRepo } = build();
        const pages = Array.from({ length: FANPAGE_BATCH_SIZE + 1 }, (_, i) => ({ id: i + 1, ...page() }));
        await svc.forPages(pages as never, TODAY);
        expect(postRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
    });

    it('ép chuỗi số của MySQL (SUM/COUNT) sang number và tách recentDates', async () => {
        const { svc } = build({
            posts: [{ fanpageId: '1', postCount: '12', lastPostDate: '2026-11-10', posts30d: '9', weekCount: '2', recentDates: '2026-11-10,2026-11-09' }],
            notes: [{ fanpageId: '1', noteCount: '4' }],
        });
        const map = await svc.forPages([{ id: 1, ...page() }] as never, TODAY);
        const r = map.get(1)!;
        expect(r).toEqual(expect.objectContaining({ postCount: 12, noteCount: 4, lastPostDate: '2026-11-10', posts30d: 9, weekCount: 2 }));
        expect(r.cadence.streak).toBe(2);
    });

    it('Page chưa có bài nào -> số 0, không lỗi', async () => {
        const { svc } = build();
        const r = (await svc.forPages([{ id: 5, ...page() }] as never, TODAY)).get(5)!;
        expect(r).toEqual(expect.objectContaining({ postCount: 0, noteCount: 0, lastPostDate: null, posts30d: 0, weekCount: 0 }));
    });

    it('Page chỉ có ghi chú, không có bài -> vẫn đếm được ghi chú', async () => {
        const { svc } = build({ notes: [{ fanpageId: 7, noteCount: 3 }] });
        const r = (await svc.forPages([{ id: 7, ...page() }] as never, TODAY)).get(7)!;
        expect(r.noteCount).toBe(3);
        expect(r.postCount).toBe(0);
    });

    it('dùng ngưỡng im lặng từ setting', async () => {
        const { svc } = build({ silent: 1, posts: [{ fanpageId: 1, postCount: 1, lastPostDate: '2026-11-10', posts30d: 1, weekCount: 1, recentDates: '2026-11-10' }] });
        const r = (await svc.forPages([{ id: 1, ...page() }] as never, TODAY)).get(1)!;
        expect(r.cadence.state).toBe('silent');
    });
});