import { BadRequestException, ConflictException } from '@nestjs/common';
import { FanpageMetricsService } from './fanpage-metrics.service';

jest.mock('../../common/utils/date-vn.util', () => ({ todayVnStr: () => '2026-11-12' }));

const user = { id: 7, role: 'employee', departmentId: 3 } as never;
const DATE = '2026-11-12';
const T1 = new Date('2026-11-12T03:00:00.000Z');
const T2 = new Date('2026-11-12T04:00:00.000Z');

function build(opts: { existing?: Record<string, unknown> | null; prevFollowers?: number | null; scopedPages?: Array<Record<string, unknown>> } = {}) {
    const existing = opts.existing === undefined ? null : opts.existing;
    const repo = {
        findOne: jest.fn().mockResolvedValue(existing),
        create: jest.fn((x) => ({ id: 50, updatedAt: T2, ...x })),
        save: jest.fn(async (x) => ({ id: 50, updatedAt: T2, ...x })),
        query: jest.fn().mockResolvedValue(opts.prevFollowers == null ? [] : [{ followers: opts.prevFollowers }]),
        createQueryBuilder: jest.fn(),
        delete: jest.fn(),
    };
    const targetRepo = { findOne: jest.fn(), save: jest.fn(), create: jest.fn((x) => x), delete: jest.fn(), update: jest.fn(), find: jest.fn() };
    const page = { id: 1, name: 'P', archivedAt: null };
    const access = {
        assertPageAccess: jest.fn().mockResolvedValue(page),
        scopesForKey: jest.fn().mockResolvedValue({ view: 'own', flagScopes: {}, managed: [] }),
    };
    const tracked = (id: number) => ({ id, name: `P${id}`, url: 'u', isActive: true, archivedAt: null, healthStatus: null, platform: { id: 1, name: 'FB', color: 'blue' } });
    const scoped = { load: jest.fn().mockResolvedValue(opts.scopedPages ?? [tracked(1), tracked(2)]) };
    const audit = { logActionAsync: jest.fn() };
    const svc = new FanpageMetricsService(repo as never, targetRepo as never, access as never, scoped as never, audit as never);
    return { svc, repo, targetRepo, access, scoped, audit, page };
}

const row = (over: Record<string, unknown> = {}) => ({ id: 50, fanpageId: 1, snapshotDate: DATE, followers: 1000, reach: null, engagement: null, views: null, note: null, updatedAt: T1, ...over });

describe('FanpageMetricsService.upsert/saveRow', () => {
    it('tạo mới: ghi createdBy/updatedBy + audit', async () => {
        const { svc, repo, audit } = build();
        repo.createQueryBuilder.mockReturnValue(chainReturning({ id: 50 }));
        await svc.upsert(1, DATE, { followers: 100 }, user);
        expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ fanpageId: 1, snapshotDate: DATE, followers: 100, createdById: 7, updatedById: 7 }));
        expect(audit.logActionAsync).toHaveBeenCalledWith(7, 'UPSERT_FANPAGE_SNAPSHOT', 'fanpage_snapshot', 50, null, expect.anything());
    });

    it('Page đã lưu trữ -> 409, không ghi', async () => {
        const { svc, repo, access, page } = build();
        access.assertPageAccess.mockResolvedValue({ ...page, archivedAt: new Date() });
        await expect(svc.upsert(1, DATE, { followers: 1 }, user)).rejects.toBeInstanceOf(ConflictException);
        expect(repo.save).not.toHaveBeenCalled();
    });

    describe('X24 - hai người sửa cùng ô', () => {
        it('expectedUpdatedAt lệch updatedAt hiện tại -> 409 FANPAGE_SNAPSHOT_STALE, KHÔNG ghi', async () => {
            const { svc, repo } = build({ existing: row({ updatedAt: T2 }) });
            const err = await svc.upsert(1, DATE, { followers: 1200, expectedUpdatedAt: T1.toISOString() }, user).catch((e) => e);
            expect(err).toBeInstanceOf(ConflictException);
            expect(err.getResponse()).toEqual(expect.objectContaining({ code: 'FANPAGE_SNAPSHOT_STALE', currentUpdatedAt: T2 }));
            expect(repo.save).not.toHaveBeenCalled();
        });
        it('lúc đọc chưa có dòng (expected=null) nhưng người khác vừa tạo -> STALE', async () => {
            const { svc, repo } = build({ existing: row() });
            await expect(svc.upsert(1, DATE, { followers: 1100, expectedUpdatedAt: null }, user)).rejects.toBeInstanceOf(ConflictException);
            expect(repo.save).not.toHaveBeenCalled();
        });
        it('expected khớp -> ghi; không gửi expected -> ghi đè', async () => {
            const a = build({ existing: row() });
            a.repo.createQueryBuilder.mockReturnValue(chainReturning({ id: 50 }));
            await a.svc.upsert(1, DATE, { followers: 1100, expectedUpdatedAt: T1.toISOString() }, user);
            expect(a.repo.save).toHaveBeenCalled();
            const b = build({ existing: row({ updatedAt: T2 }) });
            b.repo.createQueryBuilder.mockReturnValue(chainReturning({ id: 50 }));
            await b.svc.upsert(1, DATE, { followers: 1100 }, user);
            expect(b.repo.save).toHaveBeenCalled();
        });
    });

    describe('gộp trường (undefined giữ, null xoá)', () => {
        it('không gửi followers -> giữ nguyên followers cũ khi chỉ thêm reach', async () => {
            const { svc, repo } = build({ existing: row({ followers: 1000 }) });
            repo.createQueryBuilder.mockReturnValue(chainReturning({ id: 50 }));
            await svc.upsert(1, DATE, { reach: 55 }, user);
            expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ followers: 1000, reach: 55 }));
        });
        it('xoá hết mọi chỉ số -> 400 (snapshot rỗng vô nghĩa)', async () => {
            const { svc, repo } = build({ existing: row({ followers: 10 }) });
            await expect(svc.upsert(1, DATE, { followers: null }, user)).rejects.toBeInstanceOf(BadRequestException);
            expect(repo.save).not.toHaveBeenCalled();
        });
        it('ngày tương lai bị chặn', async () => {
            const { svc } = build();
            await expect(svc.upsert(1, '2026-11-13', { followers: 1 }, user)).rejects.toBeInstanceOf(BadRequestException);
        });
    });

    describe('cảnh báo giảm >50% (plan 8.6)', () => {
        it('giảm mạnh chưa xác nhận -> 409 SUSPICIOUS_DROP, không ghi', async () => {
            const { svc, repo } = build({ prevFollowers: 1000 });
            const err = await svc.upsert(1, DATE, { followers: 300 }, user).catch((e) => e);
            expect(err.getResponse()).toEqual(expect.objectContaining({ code: 'FANPAGE_SNAPSHOT_SUSPICIOUS_DROP' }));
            expect(repo.save).not.toHaveBeenCalled();
        });
        it('confirmDrop=true -> vẫn lưu', async () => {
            const { svc, repo } = build({ prevFollowers: 1000 });
            repo.createQueryBuilder.mockReturnValue(chainReturning({ id: 50 }));
            await svc.upsert(1, DATE, { followers: 300, confirmDrop: true }, user);
            expect(repo.save).toHaveBeenCalled();
        });
        it('chỉ sửa ghi chú (không gửi followers) -> không kiểm tra giảm', async () => {
            const { svc, repo } = build({ existing: row({ followers: 100 }), prevFollowers: 1000 });
            repo.createQueryBuilder.mockReturnValue(chainReturning({ id: 50 }));
            await svc.upsert(1, DATE, { note: 'ok' }, user);
            expect(repo.save).toHaveBeenCalled();
        });
    });

    it('đua tạo cùng (Page, ngày): ER_DUP_ENTRY -> thử lại 1 lần theo nhánh cập nhật', async () => {
        const { svc, repo } = build();
        repo.createQueryBuilder.mockReturnValue(chainReturning({ id: 50 }));
        repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(row());
        repo.save.mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' });
        await svc.upsert(1, DATE, { followers: 1100 }, user);
        expect(repo.save).toHaveBeenCalledTimes(2);
    });
});

describe('FanpageMetricsService.bulk - lỗi theo từng dòng', () => {
    it('Page ngoài phạm vi -> NO_ACCESS; Page lặp -> INVALID; dòng hợp lệ vẫn lưu', async () => {
        const { svc, repo } = build();
        repo.findOne.mockResolvedValue(null);
        const r = await svc.bulk(
            {
                date: DATE,
                rows: [
                    { fanpageId: 1, followers: 100 },
                    { fanpageId: 99, followers: 5 }, // không thuộc phạm vi
                    { fanpageId: 1, followers: 7 }, // lặp
                    { fanpageId: 2, followers: -5 }, // sai -> INVALID, KHÔNG làm hỏng dòng khác
                ],
            } as never,
            user,
        );
        expect(r.saved.map((s) => s.fanpageId)).toEqual([1]);
        expect(r.errors.map((e) => [e.fanpageId, e.code])).toEqual([
            [99, 'NO_ACCESS'],
            [1, 'INVALID'],
            [2, 'INVALID'],
        ]);
    });
    it('dùng scope của fanpage_metrics.manage (không phải fanpages.view) và chỉ Page đang theo dõi', async () => {
        const paused = { id: 3, name: 'P3', url: 'u', isActive: false, archivedAt: null, healthStatus: null, platform: { id: 1, name: 'FB', color: 'x' } };
        const { svc, access, repo } = build({ scopedPages: [paused] });
        repo.findOne.mockResolvedValue(null);
        const r = await svc.bulk({ date: DATE, rows: [{ fanpageId: 3, followers: 1 }] } as never, user);
        expect(access.scopesForKey).toHaveBeenCalledWith(user, 'fanpage_metrics.manage');
        expect(r.errors[0].code).toBe('NO_ACCESS');
    });
    it('không có quyền nhập -> 403 trước khi chạm DB', async () => {
        const { svc, access, scoped } = build();
        access.scopesForKey.mockResolvedValue({ view: null, flagScopes: {}, managed: [] });
        await expect(svc.bulk({ date: DATE, rows: [{ fanpageId: 1, followers: 1 }] } as never, user)).rejects.toThrow();
        expect(scoped.load).not.toHaveBeenCalled();
    });
});

describe('FanpageMetricsService.setTarget', () => {
    it('null -> xoá mục tiêu hiện có; tháng sai định dạng -> 400', async () => {
        const { svc, targetRepo } = build();
        targetRepo.findOne.mockResolvedValue({ id: 5, targetFollowerGain: 100 });
        await svc.setTarget(1, '2026-11', { targetFollowerGain: null }, user);
        expect(targetRepo.delete).toHaveBeenCalledWith(5);
        await expect(svc.setTarget(1, '2026-13', { targetFollowerGain: 1 }, user)).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('FanpageMetricsService.followerSeries/latestFollowers với Page chưa có số liệu', () => {
    it('Page không có dòng nào KHÔNG xuất hiện trong Map (để tổng không coi là 0)', async () => {
        const { svc, repo } = build();
        repo.query
            .mockResolvedValueOnce([{ fanpageId: 1, d: '2026-11-10', v: '120' }])
            .mockResolvedValueOnce([{ fanpageId: 1, d: '2026-10-01', v: '100' }]);
        const m = await svc.followerSeries([1, 2], '2026-10-14', '2026-11-12');
        expect([...m.keys()]).toEqual([1]);
        expect(m.get(1)).toEqual([
            { date: '2026-10-01', value: 100 },
            { date: '2026-11-10', value: 120 },
        ]);
    });
    it('latestFollowers: 1 lần nhập -> chưa có delta; 2 lần -> delta + số ngày', async () => {
        const { svc, repo } = build();
        repo.query.mockResolvedValue([
            { fanpageId: 1, d: '2026-11-08', v: '130', rn: '1' },
            { fanpageId: 1, d: '2026-11-01', v: '100', rn: '2' },
            { fanpageId: 2, d: '2026-11-08', v: '50', rn: '1' },
        ]);
        const m = await svc.latestFollowers([1, 2, 3]);
        expect(m.get(1)).toEqual({ date: '2026-11-08', followers: 130, delta: 30, deltaDays: 7 });
        expect(m.get(2)).toEqual({ date: '2026-11-08', followers: 50, delta: null, deltaDays: null });
        expect(m.has(3)).toBe(false);
    });
});

/** QueryBuilder giả cho getView(): mọi bước trả về chính nó, getOneOrFail trả dòng. */
function chainReturning(result: unknown) {
    const qb: Record<string, unknown> = {};
    for (const m of ['leftJoin', 'addSelect', 'where']) qb[m] = jest.fn(() => qb);
    qb.getOneOrFail = jest.fn().mockResolvedValue(result);
    return qb;
}