import { FanpageOverviewService, summarizeOverview } from './fanpage-overview.service';
import { PageInsights } from './fanpage-insights.service';

const ins = (over: Partial<PageInsights> & { state?: string; postedToday?: boolean } = {}): { insights: PageInsights } => {
    const { state = 'ok', postedToday = false, ...rest } = over;
    return {
        insights: {
            postCount: 0, noteCount: 0, lastPostDate: null, posts30d: 0, weekCount: 0, isTracked: true, isOrphan: false,
            cadence: { state, daysSinceLastPost: null, weekCount: 0, target: null, streak: 0, postedToday } as never,
            ...rest,
        } as PageInsights,
    };
};

describe('summarizeOverview', () => {
    it('danh sách rỗng -> toàn 0', () => {
        expect(summarizeOverview([])).toEqual({
            totalPages: 0, trackedPages: 0, pausedPages: 0, newPages: 0, okPages: 0, atRiskPages: 0, silentPages: 0,
            postedTodayPages: 0, orphanPages: 0, postsThisWeek: 0, posts30d: 0,
        });
    });
    it('đếm đúng từng trạng thái; tổng tracked = new + ok + at_risk + silent', () => {
        const o = summarizeOverview([
            ins({ state: 'ok' }), ins({ state: 'ok' }), ins({ state: 'silent' }), ins({ state: 'at_risk' }), ins({ state: 'new' }),
            ins({ state: 'paused', isTracked: false }),
        ]);
        expect(o.totalPages).toBe(6);
        expect(o.trackedPages).toBe(5);
        expect(o.pausedPages).toBe(1);
        expect(o).toEqual(expect.objectContaining({ okPages: 2, silentPages: 1, atRiskPages: 1, newPages: 1 }));
        expect(o.okPages + o.silentPages + o.atRiskPages + o.newPages).toBe(o.trackedPages);
    });
    it('Page không theo dõi KHÔNG góp vào bài tuần/30 ngày/đã đăng hôm nay', () => {
        const o = summarizeOverview([
            ins({ weekCount: 3, posts30d: 10, postedToday: true }),
            ins({ isTracked: false, state: 'paused', weekCount: 99, posts30d: 99, postedToday: true }),
        ]);
        expect(o.postsThisWeek).toBe(3);
        expect(o.posts30d).toBe(10);
        expect(o.postedTodayPages).toBe(1);
    });
    it('mồ côi đếm cả Page không theo dõi', () => {
        const o = summarizeOverview([ins({ isOrphan: true }), ins({ isOrphan: true, isTracked: false, state: 'paused' }), ins()]);
        expect(o.orphanPages).toBe(2);
    });
});

describe('FanpageOverviewService.overview', () => {
    it('dùng đúng 1 nguồn scope/insights + trả archivedPages; không có quyền xem -> 403 trước khi chạm DB', async () => {
        const access = { resolveScopes: jest.fn().mockResolvedValue({ view: 'all', flagScopes: {}, managed: [] }) };
        const scoped = { load: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]), countArchived: jest.fn().mockResolvedValue(4) };
        const insights = { forPages: jest.fn().mockResolvedValue(new Map([[1, ins().insights], [2, ins({ state: 'silent' }).insights]])) };
        const svc = new FanpageOverviewService(access as never, scoped as never, insights as never);
        const r = await svc.overview({ id: 1, role: 'admin', departmentId: null } as never);
        expect(scoped.load).toHaveBeenCalledWith(expect.anything(), expect.anything(), { archived: 'false' });
        expect(r).toEqual(expect.objectContaining({ totalPages: 2, okPages: 1, silentPages: 1, archivedPages: 4 }));

        access.resolveScopes.mockResolvedValue({ view: null, flagScopes: {}, managed: [] });
        scoped.load.mockClear();
        await expect(svc.overview({ id: 1 } as never)).rejects.toThrow();
        expect(scoped.load).not.toHaveBeenCalled();
    });
});
