import { BadRequestException, ConflictException } from '@nestjs/common';
import { FanpagePostsService } from './fanpage-posts.service';

const user = { id: 7, role: 'employee', departmentId: 3 } as never;

function build(existing: Array<{ id: number; url: string; postedDate: string | null }>) {
    const qb: Record<string, jest.Mock> = {};
    for (const m of ['leftJoin', 'addSelect', 'where']) qb[m] = jest.fn(() => qb);
    qb.getOneOrFail = jest.fn().mockResolvedValue({ id: 99 });
    const repo = {
        find: jest.fn().mockResolvedValue(existing),
        findOne: jest.fn<Promise<Record<string, unknown> | null>, [{ where: { id: number } }]>(async ({ where }) => {
            const r = existing.find((e) => e.id === where.id);
            return r ? { ...r, fanpageId: 5 } : null;
        }),
        create: jest.fn((x) => x),
        save: jest.fn(async (x) => ({ id: 99, ...x })),
        update: jest.fn(),
        createQueryBuilder: jest.fn(() => qb),
    };
    const access = { assertPageAccess: jest.fn().mockResolvedValue({}) };
    const audit = { logActionAsync: jest.fn() };
    return { svc: new FanpagePostsService(repo as never, access as never, audit as never, { findOne: jest.fn() } as never), repo };
}

describe('FanpagePostsService - chống trùng URL bài trong Page', () => {
    const dup = { id: 3, url: 'https://facebook.com/p/1', postedDate: '2026-11-05' };

    it('tạo bài trùng sau khi chuẩn hoá (www/m., fbclid, #, / cuối, http) -> 409 + code + existingPostId', async () => {
        const { svc, repo } = build([dup]);
        const err = await svc.create(5, { url: 'http://m.facebook.com/p/1/?fbclid=zz#c' } as never, user).catch((e) => e);
        expect(err).toBeInstanceOf(ConflictException);
        expect(err.getResponse()).toEqual(expect.objectContaining({ code: 'FANPAGE_POST_DUPLICATE', existingPostId: 3, existingPostedDate: '2026-11-05' }));
        expect(err.getResponse().message).toContain('05/11/2026');
        expect(repo.save).not.toHaveBeenCalled();
    });
    it('trùng với bài chưa có ngày đăng -> thông báo riêng', async () => {
        const { svc } = build([{ id: 4, url: 'https://x.com/a', postedDate: null }]);
        const err = await svc.create(5, { url: 'https://x.com/a' } as never, user).catch((e) => e);
        expect(err.getResponse().existingPostedDate).toBeNull();
    });
    it('link khác -> tạo bình thường', async () => {
        const { svc, repo } = build([dup]);
        await svc.create(5, { url: 'https://facebook.com/p/2' } as never, user);
        expect(repo.save).toHaveBeenCalled();
    });
    it('sửa: đổi sang link của bài khác -> 409; sửa ngày/ghi chú khi link không đổi -> KHÔNG kiểm tra trùng', async () => {
        const { svc, repo } = build([dup, { id: 8, url: 'https://facebook.com/p/9', postedDate: null }]);
        await expect(svc.update(5, 8, { url: 'https://www.facebook.com/p/1' } as never, user)).rejects.toBeInstanceOf(ConflictException);
        repo.find.mockClear();
        await svc.update(5, 8, { url: 'https://facebook.com/p/9/', note: 'n' } as never, user);
        expect(repo.find).not.toHaveBeenCalled();
    });
});

describe('FanpagePostsService - Loại bài (E5a) + dán nhiều link (B4)', () => {
    function build2(existing: Array<{ id: number; url: string; postedDate: string | null; postTypeId?: number | null }>, type?: Record<string, unknown> | null) {
        const qb: Record<string, jest.Mock> = {};
        for (const m of ['leftJoin', 'addSelect', 'where']) qb[m] = jest.fn(() => qb);
        qb.getOneOrFail = jest.fn().mockResolvedValue({ id: 99 });
        const em = { getRepository: jest.fn(() => ({ save: jest.fn(async (rows: Array<Record<string, unknown>>) => rows.map((r, i) => ({ id: 100 + i, ...r }))) })) };
        const repo = {
            find: jest.fn().mockResolvedValue(existing),
            findOne: jest.fn(async ({ where }: { where: { id: number } }) => {
                const r = existing.find((e) => e.id === where.id);
                return r ? { ...r, fanpageId: 5 } : null;
            }),
            create: jest.fn((x) => x),
            save: jest.fn(async (x) => ({ id: 99, ...x })),
            update: jest.fn(),
            createQueryBuilder: jest.fn(() => qb),
            manager: { transaction: jest.fn(async (fn: (e: unknown) => unknown) => fn(em)) },
        };
        const typeRepo = { findOne: jest.fn().mockResolvedValue(type === undefined ? { id: 2, name: 'Reels', isLocked: false } : type) };
        const audit = { logActionAsync: jest.fn() };
        const access = { assertPageAccess: jest.fn().mockResolvedValue({}) };
        return { svc: new FanpagePostsService(repo as never, access as never, audit as never, typeRepo as never), repo, audit };
    }

    it('tạo bài với loại bài đã khoá / không tồn tại -> 400, không lưu', async () => {
        const locked = build2([], { id: 2, name: 'Reels', isLocked: true });
        await expect(locked.svc.create(5, { url: 'https://a.com/1', postTypeId: 2 } as never, user)).rejects.toBeInstanceOf(BadRequestException);
        expect(locked.repo.save).not.toHaveBeenCalled();
        const missing = build2([], null);
        await expect(missing.svc.create(5, { url: 'https://a.com/1', postTypeId: 9 } as never, user)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sửa bài: giữ nguyên loại đã khoá (không đổi) thì KHÔNG bị chặn; đổi sang loại khoá thì bị chặn', async () => {
        const { svc } = build2([{ id: 8, url: 'https://a.com/x', postedDate: null, postTypeId: 2 }], { id: 2, name: 'Reels', isLocked: true });
        await expect(svc.update(5, 8, { postTypeId: 2, note: 'n' } as never, user)).resolves.toBeDefined();
        await expect(svc.update(5, 8, { postTypeId: 3 } as never, user)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('bulk: tạo phần hợp lệ trong 1 transaction, trả skipped theo từng dòng + audit', async () => {
        const { svc, repo, audit } = build2([{ id: 1, url: 'https://a.com/exists', postedDate: '2026-11-01' }]);
        const r = await svc.bulkCreate(5, { urls: ['https://a.com/1', 'oops', 'https://a.com/exists', 'https://a.com/1/'], postedDate: '2026-11-10', postTypeId: 2 } as never, user);
        expect(repo.manager.transaction).toHaveBeenCalledTimes(1);
        expect(r.requested).toBe(4);
        expect(r.created).toHaveLength(1);
        expect(r.skipped.map((s) => s.reason)).toEqual(['invalid_url', 'duplicate_existing', 'duplicate_in_batch']);
        expect(audit.logActionAsync).toHaveBeenCalledWith(7, 'BULK_CREATE_FANPAGE_POSTS', 'fanpage', 5, null, expect.objectContaining({ created: 1, skipped: 3 }));
    });

    it('bulk: không có link hợp lệ -> không mở transaction, không audit', async () => {
        const { svc, repo, audit } = build2([]);
        const r = await svc.bulkCreate(5, { urls: ['oops'] } as never, user);
        expect(r.created).toEqual([]);
        expect(repo.manager.transaction).not.toHaveBeenCalled();
        expect(audit.logActionAsync).not.toHaveBeenCalled();
    });
});
