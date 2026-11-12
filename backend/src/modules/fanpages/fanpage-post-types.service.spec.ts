import { ConflictException, NotFoundException } from '@nestjs/common';
import { FanpagePostTypesService } from './fanpage-post-types.service';

function build(rows: Record<number, Record<string, unknown>> = {}) {
    const qb: Record<string, jest.Mock> = {};
    for (const m of ['loadRelationCountAndMap', 'orderBy', 'addOrderBy', 'where']) qb[m] = jest.fn(() => qb);
    qb.getMany = jest.fn().mockResolvedValue([]);
    const repo = {
        findOne: jest.fn(async ({ where }: { where: { id?: number; name?: string } }) =>
            where.id != null ? (rows[where.id] ? { ...rows[where.id] } : null) : (Object.values(rows).find((r) => r.name === where.name) ?? null),
        ),
        create: jest.fn((x) => x),
        save: jest.fn(async (x) => ({ id: x.id ?? 50, ...x })),
        createQueryBuilder: jest.fn(() => qb),
    };
    const audit = { logActionAsync: jest.fn() };
    return { svc: new FanpagePostTypesService(repo as never, audit as never), repo, audit, qb };
}
const reels = { id: 1, name: 'Reels', color: '#722ed1', isLocked: false, sortOrder: 0 };
const video = { id: 2, name: 'Video', color: '#1677ff', isLocked: false, sortOrder: 1 };

describe('FanpagePostTypesService', () => {
    it('create: cắt tên, mặc định không khoá + màu mặc định + audit', async () => {
        const { svc, repo, audit } = build();
        await svc.create({ name: '  Livestream  ' }, 7);
        expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Livestream', isLocked: false, color: '#1677ff', sortOrder: 0 }));
        expect(audit.logActionAsync).toHaveBeenCalledWith(7, 'CREATE_FANPAGE_POST_TYPE', 'fanpage_post_type', 50, null, expect.any(Object));
    });

    it('create: tên trùng -> 409, không lưu', async () => {
        const { svc, repo } = build({ 1: reels });
        await expect(svc.create({ name: 'Reels' }, 7)).rejects.toBeInstanceOf(ConflictException);
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('update: không tìm thấy -> 404', async () => {
        const { svc } = build();
        await expect(svc.update(9, { name: 'x' }, 7)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('update: đổi tên trùng dòng khác -> 409; giữ nguyên tên của chính nó -> ok', async () => {
        const { svc } = build({ 1: reels, 2: video });
        await expect(svc.update(2, { name: 'Reels' }, 7)).rejects.toBeInstanceOf(ConflictException);
        await expect(svc.update(2, { name: 'Video' }, 7)).resolves.toBeDefined();
    });

    it('update: đổi màu + thứ tự -> lưu, audit có bản trước/sau', async () => {
        const { svc, repo, audit } = build({ 1: reels });
        await svc.update(1, { color: '#000000', sortOrder: 5 }, 7);
        expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 1, color: '#000000', sortOrder: 5 }));
        expect(audit.logActionAsync).toHaveBeenCalledWith(7, 'UPDATE_FANPAGE_POST_TYPE', 'fanpage_post_type', 1, expect.objectContaining({ color: '#722ed1' }), expect.any(Object));
    });

    it('lock / unlock + audit; KHÔNG có hàm xoá (chỉ khoá)', async () => {
        const { svc, repo, audit } = build({ 1: reels });
        await svc.lock(1, 7);
        expect(repo.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: 1, isLocked: true }));
        expect(audit.logActionAsync).toHaveBeenCalledWith(7, 'LOCK_FANPAGE_POST_TYPE', 'fanpage_post_type', 1, null, expect.any(Object));
        await svc.unlock(1, 7);
        expect(repo.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: 1, isLocked: false }));
        expect(audit.logActionAsync).toHaveBeenLastCalledWith(7, 'UNLOCK_FANPAGE_POST_TYPE', 'fanpage_post_type', 1, null, expect.any(Object));
        expect((svc as unknown as Record<string, unknown>).remove).toBeUndefined();
    });

    it('findAll(activeOnly) lọc is_locked = 0 (BooleanTransformer không chạy trong QueryBuilder); không activeOnly thì không lọc', async () => {
        const a = build();
        await a.svc.findAll(true);
        expect(a.qb.where).toHaveBeenCalledWith('t.isLocked = :l', { l: 0 });
        const b = build();
        await b.svc.findAll(false);
        expect(b.qb.where).not.toHaveBeenCalled();
    });
});