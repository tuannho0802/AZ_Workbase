import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FanpageHealthStatusesService } from './fanpage-health-statuses.service';

function build(rows: Record<number, Record<string, unknown>> = {}) {
    const repo = {
        findOne: jest.fn(async ({ where }: { where: { id?: number; name?: string } }) =>
            where.id != null ? (rows[where.id] ? { ...rows[where.id] } : null) : (Object.values(rows).find((r) => r.name === where.name) ?? null),
        ),
        create: jest.fn((x) => x),
        save: jest.fn(async (x) => ({ id: x.id ?? 50, ...x })),
    };
    const audit = { logActionAsync: jest.fn() };
    return { svc: new FanpageHealthStatusesService(repo as never, audit as never), repo, audit };
}
const normal = { id: 1, name: 'Bình thường', isDefault: true, isLocked: false, isBlocking: false };
const banned = { id: 4, name: 'Bị khoá', isDefault: false, isLocked: false, isBlocking: true };

describe('FanpageHealthStatusesService', () => {
    it('create: cắt tên, mặc định không chặn/không khoá/không phải mặc định + audit', async () => {
        const { svc, repo, audit } = build();
        await svc.create({ name: '  Hạn chế  ' }, 7);
        expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Hạn chế', isBlocking: false, isLocked: false, isDefault: false, color: '#52c41a' }));
        expect(audit.logActionAsync).toHaveBeenCalledWith(7, 'CREATE_FANPAGE_HEALTH_STATUS', 'fanpage_health_status', 50, null, expect.any(Object));
    });
    it('create: tên trùng -> 409', async () => {
        const { svc } = build({ 1: normal });
        await expect(svc.create({ name: 'Bình thường' }, 7)).rejects.toBeInstanceOf(ConflictException);
    });
    it('update: không tìm thấy -> 404', async () => {
        const { svc } = build();
        await expect(svc.update(9, { name: 'x' }, 7)).rejects.toBeInstanceOf(NotFoundException);
    });
    it('update: đổi tên trùng dòng khác -> 409; giữ nguyên tên của chính nó -> ok', async () => {
        const { svc } = build({ 1: normal, 4: banned });
        await expect(svc.update(4, { name: 'Bình thường' }, 7)).rejects.toBeInstanceOf(ConflictException);
        await expect(svc.update(4, { name: 'Bị khoá' }, 7)).resolves.toBeDefined();
    });
    it('update: dòng mặc định không được đặt is_blocking', async () => {
        const { svc, repo } = build({ 1: normal });
        await expect(svc.update(1, { isBlocking: true }, 7)).rejects.toBeInstanceOf(BadRequestException);
        expect(repo.save).not.toHaveBeenCalled();
    });
    it('update: đổi cờ chặn dòng thường -> lưu', async () => {
        const { svc, repo } = build({ 4: banned });
        await svc.update(4, { isBlocking: false, color: '#000000' }, 7);
        expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isBlocking: false, color: '#000000' }));
    });
    it('lock: không khoá được dòng mặc định; khoá dòng thường + audit; unlock', async () => {
        const { svc, repo, audit } = build({ 1: normal, 4: banned });
        await expect(svc.lock(1, 7)).rejects.toBeInstanceOf(BadRequestException);
        await svc.lock(4, 7);
        expect(repo.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: 4, isLocked: true }));
        expect(audit.logActionAsync).toHaveBeenCalledWith(7, 'LOCK_FANPAGE_HEALTH_STATUS', 'fanpage_health_status', 4, null, expect.any(Object));
        await svc.unlock(4, 7);
        expect(repo.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: 4, isLocked: false }));
    });
});
