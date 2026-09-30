import { ForbiddenException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UtmsService, UtmCaller } from './utms.service';
import { Role } from '../../common/enums/role.enum';

const mk = (over: Record<string, unknown> = {}) => ({
  id: 1, name: 'FB_Q4', description: null, color: '#1677ff', visibility: 'shared', isActive: true,
  sortOrder: 0, primaryManagerId: 10, primaryManager: { id: 10, name: 'Chính', departmentId: 5 },
  secondaryManagers: [], createdAt: new Date(), updatedAt: new Date(), ...over,
});

describe('UtmsService', () => {
  let svc: UtmsService;
  const utmRepo: any = { findOne: jest.fn(), find: jest.fn(), save: jest.fn(), create: jest.fn((x) => x), update: jest.fn(), delete: jest.fn(), query: jest.fn(), manager: { getRepository: jest.fn() } };
  const secondaryRepo: any = { find: jest.fn().mockResolvedValue([]) };
  const txManager: any = { update: jest.fn(), query: jest.fn() };
  const dataSource: any = { transaction: jest.fn(async (cb) => cb(txManager)) };
  const perms: any = { hasPermission: jest.fn() };
  const audit: any = { logActionAsync: jest.fn() };
  let scopes: Record<string, string | null>;
  let managedDepts: number[];

  const emp: UtmCaller = { id: 10, role: 'employee', departmentId: 5 };
  const root: UtmCaller = { id: 1, role: Role.ADMIN, isRootAdmin: true };

  beforeEach(() => {
    jest.clearAllMocks();
    scopes = {};
    managedDepts = [];
    perms.hasPermission.mockImplementation(async (_r: string, key: string) =>
      key in scopes ? { allowed: true, scope: scopes[key] } : { allowed: false, scope: null },
    );
    utmRepo.manager.getRepository.mockReturnValue({ find: jest.fn(async () => managedDepts.map((d) => ({ departmentId: d }))) });
    secondaryRepo.find.mockResolvedValue([]);
    dataSource.transaction.mockImplementation(async (cb: any) => cb(txManager));
    svc = new UtmsService(utmRepo, secondaryRepo, dataSource, perms, audit);
  });

  describe('scopeOf', () => {
    it('Root Admin luôn all, không hỏi DB', async () => {
      expect(await svc.scopeOf(root, 'utms.edit')).toBe('all');
      expect(perms.hasPermission).not.toHaveBeenCalled();
    });
    it('admin thường (không root) phải qua role_permissions', async () => {
      expect(await svc.scopeOf({ id: 2, role: Role.ADMIN, isRootAdmin: false }, 'utms.edit')).toBeNull();
    });
    it('có quyền nhưng scope NULL -> null (fail-closed)', async () => {
      scopes['utms.edit'] = null;
      expect(await svc.scopeOf(emp, 'utms.edit')).toBeNull();
    });
  });

  describe('create', () => {
    it('chuẩn hoá tên, đặt người tạo làm Quản lý chính', async () => {
      utmRepo.findOne.mockResolvedValueOnce(null); // assertNameFree
      utmRepo.save.mockResolvedValue({ id: 7, name: 'FB Q4', visibility: 'shared' });
      utmRepo.findOne.mockResolvedValue(mk({ id: 7, name: 'FB Q4' })); // detail -> loadUtm
      await svc.create({ name: '  FB\u00A0  Q4 ' }, emp);
      expect(utmRepo.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'FB Q4', primaryManagerId: 10, createdById: 10, visibility: 'shared' }));
      expect(audit.logActionAsync).toHaveBeenCalledWith(10, 'CREATE_UTM', 'utm', 7, null, expect.any(Object));
    });
    it('tên rỗng -> 400', async () => {
      await expect(svc.create({ name: '  \u00A0 ' }, emp)).rejects.toBeInstanceOf(BadRequestException);
    });
    it('trùng tên (khác hoa/thường/dấu) -> 409 kèm tên Quản lý chính', async () => {
      utmRepo.findOne.mockResolvedValueOnce(mk({ name: 'Mua' }));
      await expect(svc.create({ name: 'Múa' }, emp)).rejects.toThrow(/Chính/);
      expect(utmRepo.save).not.toHaveBeenCalled();
    });
    it('race: DB ném ER_DUP_ENTRY -> 409', async () => {
      utmRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(mk());
      utmRepo.save.mockRejectedValue({ code: 'ER_DUP_ENTRY' });
      await expect(svc.create({ name: 'FB_Q4' }, emp)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('Employee Marketing (own) là chính: đổi tên -> cascade snapshot + audit affectedCustomers', async () => {
      scopes['utms.edit'] = 'own';
      utmRepo.findOne.mockResolvedValueOnce(mk()).mockResolvedValueOnce(null).mockResolvedValue(mk({ name: 'FB_Q5' }));
      txManager.query.mockResolvedValueOnce({ affectedRows: 42 });
      await svc.update(1, { name: 'FB_Q5' }, emp);
      expect(txManager.update).toHaveBeenCalled();
      const sql = txManager.query.mock.calls[0][0] as string;
      expect(sql).toContain('updated_at = updated_at'); // KHÔNG làm nhảy "Sửa cuối" của khách
      expect(audit.logActionAsync).toHaveBeenCalledWith(10, 'UPDATE_UTM', 'utm', 1, expect.any(Object), expect.objectContaining({ affectedCustomers: 42 }));
    });
    it('cascade lặp theo lô đến khi hết dòng', async () => {
      scopes['utms.edit'] = 'all';
      utmRepo.findOne.mockResolvedValueOnce(mk()).mockResolvedValueOnce(null).mockResolvedValue(mk());
      txManager.query.mockResolvedValueOnce({ affectedRows: 5000 }).mockResolvedValueOnce({ affectedRows: 120 });
      await svc.update(1, { name: 'NEW' }, root);
      expect(txManager.query).toHaveBeenCalledTimes(2);
      expect(audit.logActionAsync).toHaveBeenCalledWith(1, 'UPDATE_UTM', 'utm', 1, expect.any(Object), expect.objectContaining({ affectedCustomers: 5120 }));
    });
    it('Quản lý phụ: sửa mô tả/màu được, đổi tên bị 403', async () => {
      scopes['utms.edit'] = 'own';
      const sec = mk({ primaryManagerId: 99, secondaryManagers: [{ userId: 10, user: { id: 10, name: 'Phụ' } }] });
      utmRepo.findOne.mockResolvedValue(sec);
      await expect(svc.update(1, { name: 'X' }, emp)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.update(1, { visibility: 'restricted' }, emp)).rejects.toBeInstanceOf(ForbiddenException);
      await svc.update(1, { description: 'mới', color: '#ff0000' }, emp);
      expect(txManager.update).toHaveBeenCalledWith(expect.anything(), 1, expect.objectContaining({ description: 'mới', color: '#ff0000' }));
      expect(txManager.query).not.toHaveBeenCalled(); // không đổi tên -> không cascade
    });
    it('người lạ (own, không phải chính/phụ) -> 403', async () => {
      scopes['utms.edit'] = 'own';
      utmRepo.findOne.mockResolvedValue(mk({ primaryManagerId: 99 }));
      await expect(svc.update(1, { description: 'x' }, emp)).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('Manager scope department: sửa được UTM có chính cùng phòng ban quản lý, không sửa được phòng ban khác', async () => {
      scopes['utms.edit'] = 'department';
      managedDepts = [5];
      const manager: UtmCaller = { id: 20, role: 'manager', departmentId: 5 };
      utmRepo.findOne.mockResolvedValue(mk());
      await svc.update(1, { description: 'ok' }, manager);
      utmRepo.findOne.mockResolvedValue(mk({ primaryManager: { id: 10, name: 'Chính', departmentId: 9 } }));
      await expect(svc.update(1, { description: 'no' }, manager)).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('UTM backfill chưa có chủ: department/own không sửa được, all thì được', async () => {
      const orphan = mk({ primaryManagerId: null, primaryManager: null });
      utmRepo.findOne.mockResolvedValue(orphan);
      scopes['utms.edit'] = 'department';
      managedDepts = [5];
      await expect(svc.update(1, { description: 'x' }, { id: 20, role: 'manager' })).rejects.toBeInstanceOf(ForbiddenException);
      await svc.update(1, { description: 'x' }, root);
    });
    it('đổi sang tên đã tồn tại của UTM khác -> 409, không ghi DB', async () => {
      scopes['utms.edit'] = 'all';
      utmRepo.findOne.mockResolvedValueOnce(mk()).mockResolvedValueOnce(mk({ id: 2, name: 'B' }));
      await expect(svc.update(1, { name: 'B' }, root)).rejects.toBeInstanceOf(ConflictException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
    it('không tìm thấy -> 404', async () => {
      utmRepo.findOne.mockResolvedValue(null);
      await expect(svc.update(9, {}, root)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setActive', () => {
    it('Quản lý phụ khoá được; không đổi trạng thái thì không audit', async () => {
      scopes['utms.edit'] = 'own';
      utmRepo.findOne.mockResolvedValue(mk({ primaryManagerId: 99, secondaryManagers: [{ userId: 10, user: { id: 10, name: 'P' } }] }));
      await svc.setActive(1, false, emp);
      expect(utmRepo.update).toHaveBeenCalledWith(1, { isActive: false, lockedAt: expect.any(Date) });
      utmRepo.update.mockClear();
      audit.logActionAsync.mockClear();
      await svc.setActive(1, true, emp); // đang active sẵn
      expect(utmRepo.update).not.toHaveBeenCalled();
      expect(audit.logActionAsync).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('Employee Marketing (không có utms.delete) -> 403', async () => {
      utmRepo.findOne.mockResolvedValue(mk());
      await expect(svc.remove(1, emp)).rejects.toBeInstanceOf(ForbiddenException);
      expect(utmRepo.delete).not.toHaveBeenCalled();
    });
    it('còn KH đang dùng -> 400, không xoá; đếm cả KH xoá mềm (không lọc deleted_at ở WHERE)', async () => {
      utmRepo.findOne.mockResolvedValue(mk());
      utmRepo.query.mockResolvedValue([{ active: '3', trashed: '0' }]);
      await expect(svc.remove(1, root)).rejects.toBeInstanceOf(BadRequestException);
      expect(utmRepo.query.mock.calls[0][0]).not.toMatch(/WHERE[^]*deleted_at/);
      expect(utmRepo.delete).not.toHaveBeenCalled();
    });
    it('chỉ còn KH trong Thùng rác -> 400 và thông báo nói rõ Thùng rác (nút Khách hàng hiện 0)', async () => {
      utmRepo.findOne.mockResolvedValue(mk());
      utmRepo.query.mockResolvedValue([{ active: '0', trashed: '1' }]);
      await expect(svc.remove(1, root)).rejects.toThrow(/1 khách hàng trong Thùng rác/);
      expect(utmRepo.delete).not.toHaveBeenCalled();
    });
    it('buildInUseMessage: cả đang dùng và Thùng rác', () => {
      const m = UtmsService.buildInUseMessage('X', 2, 1);
      expect(m).toContain('2 khách hàng đang dùng và 1 khách hàng trong Thùng rác');
      expect(UtmsService.buildInUseMessage('X', 2, 0)).not.toContain('Thùng rác');
    });
    it('0 KH -> xoá + audit', async () => {
      utmRepo.findOne.mockResolvedValue(mk());
      utmRepo.query.mockResolvedValue([{ active: '0', trashed: '0' }]);
      await svc.remove(1, root);
      expect(utmRepo.delete).toHaveBeenCalledWith(1);
      expect(audit.logActionAsync).toHaveBeenCalledWith(1, 'DELETE_UTM', 'utm', 1, expect.any(Object), null);
    });
  });

  describe('bulk (khoá/mở khoá/xoá hàng loạt)', () => {
    it('bulkSetActive: UTM nào lỗi quyền chỉ vào failed, UTM khác vẫn thành công, ID trùng chỉ xử lý 1 lần', async () => {
      scopes['utms.edit'] = 'own';
      utmRepo.findOne.mockImplementation(async ({ where }: any) =>
        where.id === 1 ? mk({ id: 1, primaryManagerId: 10 }) : mk({ id: where.id, primaryManagerId: 99, primaryManager: { id: 99, name: 'X', departmentId: 9 } }),
      );
      const r = await svc.bulkSetActive([1, 2, 1], false, emp);
      expect(r.succeeded).toEqual([1]);
      expect(r.failed).toEqual([{ id: 2, reason: expect.stringContaining('quyền') }]);
      expect(utmRepo.update).toHaveBeenCalledTimes(1);
    });
    it('bulkSetActive: không tìm thấy -> failed (không ném 404 cả lô)', async () => {
      scopes['utms.edit'] = 'all';
      utmRepo.findOne.mockResolvedValue(null);
      const r = await svc.bulkSetActive([5], true, emp);
      expect(r.succeeded).toEqual([]);
      expect(r.failed).toHaveLength(1);
    });
    it('bulkRemove: UTM còn KH -> failed kèm lý do, UTM trống -> xoá + audit', async () => {
      utmRepo.findOne.mockImplementation(async ({ where }: any) => mk({ id: where.id }));
      utmRepo.query.mockResolvedValueOnce([{ active: '2', trashed: '0' }]).mockResolvedValueOnce([{ active: '0', trashed: '0' }]);
      const r = await svc.bulkRemove([1, 2], root);
      expect(r.succeeded).toEqual([2]);
      expect(r.failed[0]).toEqual({ id: 1, reason: expect.stringContaining('2 khách hàng đang dùng') });
      expect(utmRepo.delete).toHaveBeenCalledTimes(1);
      expect(utmRepo.delete).toHaveBeenCalledWith(2);
    });
    it('lỗi hệ thống (không phải HttpException) vẫn ném ra', async () => {
      scopes['utms.edit'] = 'all';
      utmRepo.findOne.mockRejectedValue(new Error('db down'));
      await expect(svc.bulkSetActive([1], false, root)).rejects.toThrow('db down');
    });
  });

  describe('findUsable / listScoped / capabilities', () => {
    it('Employee KHÔNG có utms.view vẫn gọi được dropdown (không ném lỗi), query lọc restricted', async () => {
      const qb: any = {};
      for (const m of ['orderBy', 'addOrderBy', 'take', 'andWhere']) qb[m] = jest.fn(() => qb);
      qb.getMany = jest.fn().mockResolvedValue([mk()]);
      utmRepo.createQueryBuilder = jest.fn(() => qb);
      const res = await svc.findUsable(emp, {});
      expect(res[0]).toMatchObject({ id: 1, myRole: 'primary' });
      const where = qb.andWhere.mock.calls.map((c: any[]) => c[0]).join(' ');
      expect(where).toContain(`visibility = 'shared'`);
    });
    it('viewScope all: không thêm điều kiện lọc restricted', async () => {
      const qb: any = {};
      for (const m of ['orderBy', 'addOrderBy', 'take', 'andWhere']) qb[m] = jest.fn(() => qb);
      qb.getMany = jest.fn().mockResolvedValue([]);
      utmRepo.createQueryBuilder = jest.fn(() => qb);
      await svc.findUsable(root, { activeOnly: true, q: 'a%b' });
      const clauses = qb.andWhere.mock.calls.map((c: any[]) => c[0]) as string[];
      expect(clauses.some((c) => c.includes('shared'))).toBe(false);
      expect(qb.andWhere).toHaveBeenCalledWith('utm.name LIKE :q', { q: '%a\\%b%' }); // escape ký tự đại diện
    });
    it('listScoped: scope own chỉ trả UTM mình là chính/phụ', async () => {
      scopes['utms.view'] = 'own';
      utmRepo.find.mockResolvedValue([mk({ id: 1 }), mk({ id: 2, primaryManagerId: 99 })]);
      const res = await svc.listScoped(emp);
      expect(res.map((r) => r.id)).toEqual([1]);
    });
    it('listScoped: không có utms.view -> []', async () => {
      expect(await svc.listScoped(emp)).toEqual([]);
    });
    it('capabilities: Employee Marketing chính = sửa/gán được, xoá không', async () => {
      scopes['utms.edit'] = 'own';
      scopes['utms.assign'] = 'own';
      utmRepo.findOne.mockResolvedValue(mk());
      const v = await svc.getOne(1, emp);
      expect(v.capabilities).toEqual({ canEditIdentity: true, canEditMeta: true, canAssign: true, canDelete: false });
    });
  });

  describe('resolveForCustomer', () => {
    it('không gửi utmId/campaign -> null (không đổi)', async () => {
      expect(await svc.resolveForCustomer({}, emp)).toBeNull();
    });
    it('utmId=null -> xoá cả utm_id lẫn snapshot', async () => {
      expect(await svc.resolveForCustomer({ utmId: null }, emp)).toEqual({ utmId: null, campaign: null });
    });
    it('utmId hợp lệ: campaign = tên UTM, BỎ QUA campaign gửi kèm (case 11)', async () => {
      utmRepo.findOne.mockResolvedValueOnce(mk({ id: 3, name: 'FB_Q4' }));
      expect(await svc.resolveForCustomer({ utmId: 3, campaign: 'khác' }, emp)).toEqual({ utmId: 3, campaign: 'FB_Q4' });
    });
    it('utmId không tồn tại -> 400', async () => {
      utmRepo.findOne.mockResolvedValueOnce(null);
      await expect(svc.resolveForCustomer({ utmId: 99 }, emp)).rejects.toBeInstanceOf(BadRequestException);
    });
    it('UTM khoá: chọn mới -> 400, nhưng giữ nguyên giá trị hiện tại vẫn OK (case 8)', async () => {
      utmRepo.findOne.mockResolvedValue(mk({ id: 3, isActive: false }));
      await expect(svc.resolveForCustomer({ utmId: 3 }, emp, 5)).rejects.toBeInstanceOf(BadRequestException);
      expect(await svc.resolveForCustomer({ utmId: 3 }, emp, 3)).toEqual({ utmId: 3, campaign: 'FB_Q4' });
    });
    it('UTM restricted, người gọi không phải chính/phụ và scope view không phải all -> 403; đang giữ sẵn thì OK (case 9)', async () => {
      const restricted = mk({ id: 3, visibility: 'restricted', primaryManagerId: 99, primaryManager: { id: 99, name: 'X', departmentId: 7 } });
      utmRepo.findOne.mockResolvedValue(restricted);
      scopes['utms.view'] = 'own';
      await expect(svc.resolveForCustomer({ utmId: 3 }, emp, null)).rejects.toBeInstanceOf(ForbiddenException);
      expect(await svc.resolveForCustomer({ utmId: 3 }, emp, 3)).toEqual({ utmId: 3, campaign: 'FB_Q4' });
    });
    it('UTM restricted: người gọi là Quản lý chính -> được dùng', async () => {
      utmRepo.findOne.mockResolvedValue(mk({ id: 3, visibility: 'restricted' })); // primaryManagerId=10=emp
      scopes['utms.view'] = 'own';
      expect((await svc.resolveForCustomer({ utmId: 3 }, emp, null))?.utmId).toBe(3);
    });
    it('chỉ có campaign (tương thích): tìm thấy theo tên -> dùng UTM có sẵn, snapshot = tên chuẩn', async () => {
      utmRepo.findOne.mockResolvedValueOnce(mk({ id: 4, name: 'Mua' }));
      expect(await svc.resolveForCustomer({ campaign: ' múa ' }, emp)).toEqual({ utmId: 4, campaign: 'Mua' });
    });
    it('campaign rỗng/NBSP -> xoá UTM', async () => {
      expect(await svc.resolveForCustomer({ campaign: ' \u00A0 ' }, emp)).toEqual({ utmId: null, campaign: null });
    });
    it('campaign chưa có + KHÔNG có utms.create -> 400, không tạo', async () => {
      utmRepo.findOne.mockResolvedValue(null);
      await expect(svc.resolveForCustomer({ campaign: 'MỚI' }, emp)).rejects.toThrow(/không có quyền tạo/);
      expect(utmRepo.save).not.toHaveBeenCalled();
    });
    it('campaign chưa có + có utms.create (nhị phân, scope null) -> tạo mới', async () => {
      scopes['utms.create'] = null;
      utmRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null); // resolve + assertNameFree
      utmRepo.save.mockResolvedValue({ id: 8, name: 'MỚI', visibility: 'shared' });
      utmRepo.findOne.mockResolvedValue(mk({ id: 8, name: 'MỚI' })); // detail
      expect(await svc.resolveForCustomer({ campaign: 'MỚI' }, emp)).toEqual({ utmId: 8, campaign: 'MỚI' });
    });
  });

  describe('similarityKey / findDuplicates / merge / findRecent', () => {
    it('similarityKey: bỏ dấu, hạ chữ, bỏ ký tự đặc biệt', () => {
      expect(UtmsService.similarityKey('FB-Q4')).toBe('fbq4');
      expect(UtmsService.similarityKey('fb_q4 ')).toBe('fbq4');
      expect(UtmsService.similarityKey('Đông Xuân')).toBe('dongxuan');
      expect(UtmsService.similarityKey('---')).toBe('');
    });

    it('findDuplicates: chỉ scope all; gom nhóm gần giống kèm số KH', async () => {
      scopes['utms.edit'] = 'department';
      await expect(svc.findDuplicates(emp)).rejects.toBeInstanceOf(ForbiddenException);
      utmRepo.find.mockResolvedValue([mk({ id: 1, name: 'FB-Q4' }), mk({ id: 2, name: 'FB_Q4' }), mk({ id: 3, name: 'TikTok' })]);
      utmRepo.query.mockResolvedValue([{ utm_id: 1, c: '5' }]);
      const res = await svc.findDuplicates(root);
      expect(res).toHaveLength(1);
      expect(res[0].utms.map((u) => [u.id, u.customerCount])).toEqual([[1, 5], [2, 0]]);
    });
    it('findDuplicates: không có nhóm trùng -> [] và không truy vấn đếm', async () => {
      utmRepo.find.mockResolvedValue([mk({ id: 1, name: 'A' }), mk({ id: 2, name: 'B' })]);
      expect(await svc.findDuplicates(root)).toEqual([]);
      expect(utmRepo.query).not.toHaveBeenCalled();
    });

    it('merge: không phải scope all -> 403, không đụng DB', async () => {
      scopes['utms.edit'] = 'own';
      await expect(svc.merge(1, { targetId: 2 }, emp)).rejects.toBeInstanceOf(ForbiddenException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
    it('merge: nguồn = đích -> 400; đích đang khoá -> 400', async () => {
      await expect(svc.merge(1, { targetId: 1 }, root)).rejects.toBeInstanceOf(BadRequestException);
      utmRepo.findOne.mockResolvedValueOnce(mk({ id: 1 })).mockResolvedValueOnce(mk({ id: 2, isActive: false }));
      await expect(svc.merge(1, { targetId: 2 }, root)).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
    it('merge: chuyển KH sang đích (utm_id + snapshot, giữ updated_at), xoá nguồn cùng transaction, audit MERGE_UTM', async () => {
      utmRepo.findOne
        .mockResolvedValueOnce(mk({ id: 1, name: 'FB-Q4' }))
        .mockResolvedValueOnce(mk({ id: 2, name: 'FB_Q4' }))
        .mockResolvedValue(mk({ id: 2, name: 'FB_Q4' }));
      txManager.query.mockResolvedValueOnce({ affectedRows: 7 }).mockResolvedValueOnce({});
      const res = await svc.merge(1, { targetId: 2 }, root);
      expect(res.movedCustomers).toBe(7);
      expect(txManager.query.mock.calls[0][0]).toMatch(/updated_at = updated_at/);
      expect(txManager.query.mock.calls[0][1]).toEqual([2, 'FB_Q4', 1]);
      expect(txManager.query.mock.calls[1][0]).toMatch(/DELETE FROM utms/);
      expect(audit.logActionAsync).toHaveBeenCalledWith(1, 'MERGE_UTM', 'utm', 2, expect.any(Object), expect.objectContaining({ movedCustomers: 7 }));
    });
    it('merge: lặp theo lô đến khi hết dòng', async () => {
      utmRepo.findOne.mockResolvedValue(mk({ id: 2 })).mockResolvedValueOnce(mk({ id: 1 })).mockResolvedValueOnce(mk({ id: 2 }));
      txManager.query.mockResolvedValueOnce({ affectedRows: 5000 }).mockResolvedValueOnce({ affectedRows: 30 }).mockResolvedValueOnce({});
      const res = await svc.merge(1, { targetId: 2 }, root);
      expect(res.movedCustomers).toBe(5030);
    });

    it('findRecent: truy vấn theo người tạo là mình, kẹp limit', async () => {
      utmRepo.query.mockResolvedValue([{ id: '3', name: 'A', color: '#111' }]);
      expect(await svc.findRecent(emp, 999)).toEqual([{ id: 3, name: 'A', color: '#111' }]);
      expect(utmRepo.query.mock.calls[0][1]).toEqual([10, 20]);
    });
  });
});
