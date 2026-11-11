import { ConflictException } from '@nestjs/common';
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
    return { svc: new FanpagePostsService(repo as never, access as never, audit as never), repo };
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
