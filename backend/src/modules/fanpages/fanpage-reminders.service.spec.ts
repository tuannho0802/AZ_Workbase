import { FanpageRemindersService } from './fanpage-reminders.service';
import { PageInsights } from './fanpage-insights.service';

const ins = (state: PageInsights['cadence']['state'], over: Partial<PageInsights['cadence']> = {}, lastPostDate: string | null = null): PageInsights =>
    ({
        isTracked: true,
        isOrphan: false,
        postCount: 0,
        noteCount: 0,
        lastPostDate,
        posts30d: 0,
        weekCount: 0,
        recentPostDates: [],
        cadence: { state, daysSinceLastPost: null, weekCount: 1, target: 5, streak: 0, postedToday: false, ...over },
    }) as unknown as PageInsights;

const page = (id: number, owners: number[] = [10, 11], createdAt = new Date('2026-10-01T00:00:00Z')) =>
    ({ id, name: `Page ${id}`, createdAt, owners: owners.map((o) => ({ id: o })) }) as any;

describe('FanpageRemindersService', () => {
    const TODAY = '2026-11-11'; // Thứ Tư -> thứ Hai của tuần = 2026-11-09
    let scoped: { loadTrackable: jest.Mock };
    let insights: { forPages: jest.Mock };
    let settings: { getSilentDays: jest.Mock };
    let notifications: { findEmittedEntityIds: jest.Mock; emitNow: jest.Mock };
    let service: FanpageRemindersService;

    beforeEach(() => {
        scoped = { loadTrackable: jest.fn().mockResolvedValue([page(1), page(2), page(3)]) };
        insights = {
            forPages: jest.fn().mockResolvedValue(
                new Map<number, PageInsights>([
                    [1, ins('silent', { daysSinceLastPost: 5 }, '2026-11-06')],
                    [2, ins('at_risk')],
                    [3, ins('ok', { postedToday: true })],
                ]),
            ),
        };
        settings = { getSilentDays: jest.fn().mockResolvedValue(3) };
        notifications = { findEmittedEntityIds: jest.fn().mockResolvedValue(new Set<number>()), emitNow: jest.fn().mockResolvedValue(undefined) };
        service = new FanpageRemindersService(scoped as any, insights as any, settings as any, notifications as any);
    });

    it('trước 17:00 giờ VN: thoát sớm, KHÔNG query gì', async () => {
        const r = await service.runDueReminders({ clock: { hour: 16, today: TODAY } });
        expect(r.pastCutoff).toBe(false);
        expect(scoped.loadTrackable).not.toHaveBeenCalled();
        expect(notifications.emitNow).not.toHaveBeenCalled();
    });

    it('17:00 trở đi: nhắc im lặng (mốc 3) + nguy cơ trễ tuần, gửi cho mọi người phụ trách, actor = Hệ thống', async () => {
        const r = await service.runDueReminders({ clock: { hour: 17, today: TODAY } });
        expect(r.silentPageIds).toEqual([1]);
        expect(r.atRiskPageIds).toEqual([2]);
        const calls = notifications.emitNow.mock.calls.map((c) => c[0]);
        const silent = calls.find((c) => c.type === 'fanpage.silent');
        expect(silent).toMatchObject({
            actorId: null,
            entity: { type: 'fanpage', id: 1 },
            recipients: { fanpage: { ownerIds: [10, 11] } },
            params: { days: 5 },
            dedupeSuffix: '2026-11-06:m3',
        });
        const risk = calls.find((c) => c.type === 'fanpage.weekly_at_risk');
        expect(risk).toMatchObject({ entity: { id: 2 }, params: { weekCount: 1, target: 5 }, dedupeSuffix: '2026-11-09' });
    });

    it('Page đã đăng hôm nay không bị nhắc', async () => {
        const r = await service.runDueReminders({ clock: { hour: 20, today: TODAY } });
        expect([...r.silentPageIds, ...r.atRiskPageIds]).not.toContain(3);
    });

    it('idempotent: Page đã nhắc (findEmittedEntityIds) bị bỏ qua -> gọi lặp không gửi trùng', async () => {
        notifications.findEmittedEntityIds.mockImplementation(async (type: string) => new Set(type === 'fanpage.silent' ? [1] : [2]));
        const r = await service.runDueReminders({ clock: { hour: 18, today: TODAY } });
        expect(r.silentPageIds).toEqual([]);
        expect(r.atRiskPageIds).toEqual([]);
        expect(notifications.emitNow).not.toHaveBeenCalled();
    });

    it('dryRun: chỉ liệt kê, KHÔNG ghi thông báo', async () => {
        const r = await service.runDueReminders({ dryRun: true, clock: { hour: 18, today: TODAY } });
        expect(r.silentPageIds).toEqual([1]);
        expect(notifications.emitNow).not.toHaveBeenCalled();
    });

    it('Page im lặng nhưng chưa tới mốc (silentDays=5, mới 4 ngày) -> không nhắc', async () => {
        settings.getSilentDays.mockResolvedValue(5);
        insights.forPages.mockResolvedValue(new Map([[1, ins('silent', { daysSinceLastPost: 4 }, '2026-11-07')]]));
        scoped.loadTrackable.mockResolvedValue([page(1)]);
        const r = await service.runDueReminders({ clock: { hour: 18, today: TODAY } });
        expect(r.silentPageIds).toEqual([]);
    });

    it('Page chưa từng đăng: neo = ngày tạo Page (VN)', async () => {
        insights.forPages.mockResolvedValue(new Map([[1, ins('silent', { daysSinceLastPost: null }, null)]]));
        scoped.loadTrackable.mockResolvedValue([page(1, [10], new Date('2026-11-01T03:00:00Z'))]);
        await service.runDueReminders({ clock: { hour: 18, today: TODAY } });
        expect(notifications.emitNow.mock.calls[0][0]).toMatchObject({ params: { days: 10 }, dedupeSuffix: '2026-11-01:m7' });
    });

    it('1 lần gửi lỗi không làm hỏng các Page còn lại', async () => {
        jest.spyOn((service as any).logger, 'error').mockImplementation();
        notifications.emitNow.mockRejectedValueOnce(new Error('db down'));
        await service.runDueReminders({ clock: { hour: 18, today: TODAY } });
        expect(notifications.emitNow).toHaveBeenCalledTimes(2);
    });

    it('không có Page theo dõi -> không query insights', async () => {
        scoped.loadTrackable.mockResolvedValue([]);
        const r = await service.runDueReminders({ clock: { hour: 18, today: TODAY } });
        expect(r.pastCutoff).toBe(true);
        expect(insights.forPages).not.toHaveBeenCalled();
    });
});