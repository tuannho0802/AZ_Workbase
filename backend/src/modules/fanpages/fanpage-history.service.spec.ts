import { diffFanpageAudit, FanpageHistoryService } from './fanpage-history.service';

describe('diffFanpageAudit', () => {
    it('CREATE -> 1 sự kiện created kèm người phụ trách + tình trạng ban đầu', () => {
        const r = diffFanpageAudit('CREATE_FANPAGE', null, { ownerIds: [1, 2], healthStatusId: 1 });
        expect(r).toEqual([{ type: 'created', before: null, after: { ownerIds: [1, 2], healthStatusId: 1 } }]);
    });
    it('ARCHIVE / UNARCHIVE -> sự kiện archive đúng chiều', () => {
        expect(diffFanpageAudit('ARCHIVE_FANPAGE', null, null)[0]).toEqual({ type: 'archive', before: { archived: false }, after: { archived: true } });
        expect(diffFanpageAudit('UNARCHIVE_FANPAGE', null, null)[0]).toEqual({ type: 'archive', before: { archived: true }, after: { archived: false } });
    });
    it('action lạ -> không sinh sự kiện', () => {
        expect(diffFanpageAudit('DELETE_FANPAGE', {}, {})).toEqual([]);
    });
    it('UPDATE đổi người phụ trách (so theo tập, bỏ qua thứ tự)', () => {
        expect(diffFanpageAudit('UPDATE_FANPAGE', { ownerIds: [1, 2] }, { ownerIds: [2, 1] })).toEqual([]);
        expect(diffFanpageAudit('UPDATE_FANPAGE', { ownerIds: [1] }, { ownerIds: [1, 3] })).toEqual([{ type: 'owners', before: [1], after: [1, 3] }]);
    });
    it('UPDATE đổi tình trạng hoặc chỉ đổi ghi chú tình trạng -> health', () => {
        const a = diffFanpageAudit('UPDATE_FANPAGE', { healthStatusId: 1, healthNote: null }, { healthStatusId: 2, healthNote: null });
        expect(a).toHaveLength(1);
        expect(a[0].type).toBe('health');
        const b = diffFanpageAudit('UPDATE_FANPAGE', { healthStatusId: 2, healthNote: null }, { healthStatusId: 2, healthNote: 'chờ kháng nghị' });
        expect(b).toHaveLength(1);
        expect(diffFanpageAudit('UPDATE_FANPAGE', { healthStatusId: 2, healthNote: 'x' }, { healthStatusId: 2, healthNote: 'x' })).toEqual([]);
    });
    it('UPDATE đổi theo dõi -> tracking', () => {
        expect(diffFanpageAudit('UPDATE_FANPAGE', { isActive: true }, { isActive: false })).toEqual([
            { type: 'tracking', before: { isActive: true }, after: { isActive: false } },
        ]);
    });
    it('1 lần UPDATE đổi nhiều thứ -> nhiều sự kiện', () => {
        const r = diffFanpageAudit('UPDATE_FANPAGE', { ownerIds: [1], healthStatusId: 1, isActive: true }, { ownerIds: [2], healthStatusId: 3, isActive: false });
        expect(r.map((x) => x.type)).toEqual(['owners', 'health', 'tracking']);
    });
    it('bản ghi audit cũ thiếu trường -> KHÔNG bịa lịch sử', () => {
        expect(diffFanpageAudit('UPDATE_FANPAGE', { isActive: true }, { isActive: true, healthStatusId: 2, ownerIds: [5] })).toEqual([]);
        expect(diffFanpageAudit('UPDATE_FANPAGE', null, null)).toEqual([]);
    });
});

describe('FanpageHistoryService.list', () => {
    const build = (logs: unknown[]) => {
        const auditRepo = { find: jest.fn().mockResolvedValue(logs) };
        const userRepo = { find: jest.fn().mockResolvedValue([{ id: 1, name: 'An' }, { id: 2, name: 'Bình' }]) };
        const healthRepo = { find: jest.fn().mockResolvedValue([{ id: 1, name: 'Bình thường' }, { id: 2, name: 'Checkpoint' }]) };
        const access = { assertPageAccess: jest.fn().mockResolvedValue({}) };
        const svc = new FanpageHistoryService(auditRepo as never, userRepo as never, healthRepo as never, access as never);
        return { svc, auditRepo, userRepo, healthRepo, access };
    };
    const caller = { id: 9, role: 'employee', departmentId: 3 } as never;
    const at = new Date('2026-11-10T03:00:00Z');

    it('kiểm tra quyền xem Page trước, lỗi thì không đọc audit', async () => {
        const { svc, access, auditRepo } = build([]);
        access.assertPageAccess.mockRejectedValue(new Error('403'));
        await expect(svc.list(5, caller)).rejects.toThrow('403');
        expect(auditRepo.find).not.toHaveBeenCalled();
    });

    it('truy vấn đúng entity/action, giới hạn số dòng', async () => {
        const { svc, auditRepo } = build([]);
        await svc.list(5, caller);
        const arg = auditRepo.find.mock.calls[0][0];
        expect(arg.where).toEqual(expect.objectContaining({ entityType: 'fanpage', entityId: 5 }));
        expect(arg.take).toBe(200);
    });

    it('đổi người phụ trách + tình trạng: gắn tên người/tên tình trạng, gộp truy vấn (không N+1)', async () => {
        const logs = [
            { id: 11, action: 'UPDATE_FANPAGE', userId: 1, createdAt: at, oldData: { ownerIds: [1], healthStatusId: 1, healthNote: null }, newData: { ownerIds: [1, 2], healthStatusId: 2, healthNote: 'x' } },
        ];
        const { svc, userRepo, healthRepo } = build(logs);
        const ev = await svc.list(5, caller);
        expect(ev.map((e) => e.type)).toEqual(['owners', 'health']);
        expect(ev[0].actor).toEqual({ id: 1, name: 'An' });
        expect(ev[0].after).toEqual([{ id: 1, name: 'An' }, { id: 2, name: 'Bình' }]);
        expect(ev[1].after).toEqual({ healthStatusId: 2, healthStatusName: 'Checkpoint', healthNote: 'x' });
        expect(userRepo.find).toHaveBeenCalledTimes(1);
        expect(healthRepo.find).toHaveBeenCalledTimes(1);
        expect(new Set(ev.map((e) => e.id)).size).toBe(ev.length);
    });

    it('người dùng đã bị xoá -> hiện #id, actor null khi audit không có userId', async () => {
        const logs = [{ id: 1, action: 'ARCHIVE_FANPAGE', userId: null, createdAt: at, oldData: null, newData: null }];
        const { svc } = build(logs);
        const ev = await svc.list(5, caller);
        expect(ev[0].actor).toBeNull();
        expect(ev[0].type).toBe('archive');
    });

    it('không có sự kiện -> không truy vấn user/tình trạng', async () => {
        const { svc, userRepo, healthRepo } = build([]);
        expect(await svc.list(5, caller)).toEqual([]);
        expect(userRepo.find).not.toHaveBeenCalled();
        expect(healthRepo.find).not.toHaveBeenCalled();
    });
});
