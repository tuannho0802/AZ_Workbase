import { FanpageTodayService } from './fanpage-today.service';
import { PageInsights } from './fanpage-insights.service';

const insights = (state: PageInsights['cadence']['state'], over: Partial<PageInsights['cadence']> = {}, tracked = state !== 'paused'): PageInsights =>
    ({
        isTracked: tracked,
        isOrphan: false,
        postCount: 0,
        noteCount: 0,
        lastPostDate: '2026-11-05',
        posts30d: 3,
        weekCount: 0,
        recentPostDates: [],
        cadence: { state, daysSinceLastPost: 6, weekCount: 0, target: null, streak: 0, postedToday: false, ...over },
    }) as unknown as PageInsights;

const page = (id: number) =>
    ({
        id,
        name: `Page ${id}`,
        url: 'https://x.test',
        ownerId: 1,
        owners: [{ id: 1, name: 'An' }],
        platform: { id: 1, name: 'Facebook', color: '#1677ff', isActive: true },
        healthStatus: null,
    }) as any;

describe('FanpageTodayService', () => {
    const user = { id: 1, role: 'employee' } as any;
    let access: { resolveScopes: jest.Mock; flagsFor: jest.Mock };
    let scoped: { load: jest.Mock };
    let ins: { forPages: jest.Mock };
    let service: FanpageTodayService;

    beforeEach(() => {
        access = { resolveScopes: jest.fn().mockResolvedValue({ view: 'own' }), flagsFor: jest.fn().mockReturnValue({ canManagePosts: true }) };
        scoped = { load: jest.fn().mockResolvedValue([page(1), page(2), page(3), page(4)]) };
        ins = {
            forPages: jest.fn().mockResolvedValue(
                new Map<number, PageInsights>([
                    [1, insights('silent')],
                    [2, insights('ok', { postedToday: true, daysSinceLastPost: 0 })],
                    [3, insights('ok')],
                    [4, insights('paused')],
                ]),
            ),
        };
        service = new FanpageTodayService(access as any, scoped as any, ins as any);
    });

    it('chia 3 nhóm, bỏ Page tạm ngừng, kèm counts', async () => {
        const out = await service.today(user);
        expect(out.needAction.map((p) => p.id)).toEqual([1]);
        expect(out.postedToday.map((p) => p.id)).toEqual([2]);
        expect(out.ok.map((p) => p.id)).toEqual([3]);
        expect(out.counts).toEqual({ needAction: 1, postedToday: 1, ok: 1 });
    });

    it('chỉ lấy Page chưa lưu trữ và KHÔNG đếm ghi chú (1 SQL/lô)', async () => {
        await service.today(user);
        expect(scoped.load).toHaveBeenCalledWith(user, expect.anything(), { archived: 'false' });
        expect(ins.forPages).toHaveBeenCalledWith(expect.any(Array), expect.any(String), { withNotes: false });
    });

    it('canManagePosts lấy theo flags của từng Page', async () => {
        access.flagsFor.mockImplementation((p: { id: number }) => ({ canManagePosts: p.id === 1 }));
        const out = await service.today(user);
        expect(out.needAction[0].canManagePosts).toBe(true);
        expect(out.ok[0].canManagePosts).toBe(false);
    });

    it('countNeedAction = đúng độ dài nhóm needAction của today() (X2/X16)', async () => {
        expect(await service.countNeedAction(user)).toBe((await service.today(user)).counts.needAction);
    });

    it('countNeedAction: không có quyền xem -> 0 và không truy vấn gì', async () => {
        access.resolveScopes.mockResolvedValue({ view: null });
        expect(await service.countNeedAction(user)).toBe(0);
        expect(scoped.load).not.toHaveBeenCalled();
    });

    it('countNeedAction: không có Page nào -> 0, không chạy truy vấn bài', async () => {
        scoped.load.mockResolvedValue([]);
        expect(await service.countNeedAction(user)).toBe(0);
        expect(ins.forPages).not.toHaveBeenCalled();
    });
});