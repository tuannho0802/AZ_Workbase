import { BadRequestException } from '@nestjs/common';
import { FanpageStatsService } from './fanpage-stats.service';

jest.mock('../../common/utils/date-vn.util', () => ({ todayVnStr: () => '2026-11-12' }));

const user = { id: 1, role: 'admin', departmentId: null } as never;
const page = (id: number, over: Record<string, unknown> = {}) => ({ id, name: `P${id}`, isActive: true, archivedAt: null, healthStatus: null, targetPostsPerWeek: null, ...over });

function build(pages: Array<Record<string, unknown>>, series: Map<number, Array<{ date: string; value: number }>>) {
    const access = { scopesForKey: jest.fn().mockResolvedValue({ view: 'all', flagScopes: {}, managed: [] }), assertPageAccess: jest.fn() };
    const scoped = { load: jest.fn().mockResolvedValue(pages) };
    const metrics = { followerSeries: jest.fn().mockResolvedValue(series) };
    const postRepo = { createQueryBuilder: jest.fn() };
    return { svc: new FanpageStatsService(postRepo as never, access as never, scoped as never, metrics as never), access, scoped, postRepo };
}

describe('FanpageStatsService.growth', () => {
    it('dùng scope fanpage_stats.view; Page chưa có số liệu bị bỏ khỏi tổng và được đếm (không coi là 0)', async () => {
        const series = new Map([
            [1, [{ date: '2026-10-01', value: 100 }, { date: '2026-11-10', value: 150 }]],
            [2, [{ date: '2026-11-10', value: 40 }]], // chỉ 1 mốc -> có follower nhưng KHÔNG đủ để tính tăng trưởng
        ]);
        const { svc, access } = build([page(1), page(2), page(3)], series);
        const r = await svc.growth(user, { from: '2026-10-14', to: '2026-11-12' });
        expect(access.scopesForKey).toHaveBeenCalledWith(user, 'fanpage_stats.view');
        expect(r.pagesWithoutMetrics).toBe(1); // P3
        expect(r.totalPages).toBe(3);
        expect(r.gain).toEqual({ total: 50, pagesWithGain: 1 }); // chỉ P1 đủ 2 mốc
        expect(r.pageRows.map((x) => x.id)).toEqual([1]);
        expect(r.points[r.points.length - 1].total).toBe(190); // 150 + 40, P3 không góp
    });
    it('Page so sánh ngoài phạm vi bị bỏ qua im lặng; quá 5 Page -> 400', async () => {
        const { svc } = build([page(1)], new Map());
        const ok = await svc.growth(user, { from: '2026-11-01', to: '2026-11-12', pageIds: [1, 999] });
        expect(ok.perPage.map((p) => p.id)).toEqual([1]);
        const many = Array.from({ length: 6 }, (_, i) => i + 1);
        const { svc: s2 } = build(many.map((i) => page(i)), new Map());
        await expect(s2.growth(user, { from: '2026-11-01', to: '2026-11-12', pageIds: many })).rejects.toBeInstanceOf(BadRequestException);
    });
    it('kỳ tương lai / đảo ngược -> 400, chưa chạm DB', async () => {
        const { svc, scoped } = build([], new Map());
        await expect(svc.growth(user, { from: '2026-11-01', to: '2026-12-01' })).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.growth(user, { from: '2026-11-10', to: '2026-11-01' })).rejects.toBeInstanceOf(BadRequestException);
        expect(scoped.load).not.toHaveBeenCalled();
    });
    it('không có quyền stats -> 403 trước khi nạp Page', async () => {
        const { svc, access, scoped } = build([], new Map());
        access.scopesForKey.mockResolvedValue({ view: null, flagScopes: {}, managed: [] });
        await expect(svc.growth(user, {})).rejects.toThrow();
        expect(scoped.load).not.toHaveBeenCalled();
    });
});