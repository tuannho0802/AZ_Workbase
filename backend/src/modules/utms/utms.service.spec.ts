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
      expect(utmRepo.update).toHaveBeenCalledWith(1, { isActive: false });
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
    it('còn KH tham chiếu (kể cả xoá mềm) -> 400, không xoá', async () => {
      utmRepo.findOne.mockResolvedValue(mk());
      utmRepo.query.mockResolvedValue([{ c: '3' }]);
      await expect(svc.remove(1, root)).rejects.toBeInstanceOf(BadRequestException);
      expect(utmRepo.query.mock.calls[0][0]).not.toMatch(/deleted_at/);
      expect(utmRepo.delete).not.toHaveBeenCalled();
    });
    it('0 KH -> xoá + audit', async () => {
      utmRepo.findOne.mockResolvedValue(mk());
      utmRepo.query.mockResolvedValue([{ c: '0' }]);
      await svc.remove(1, root);
      expect(utmRepo.delete).toHaveBeenCalledWith(1);
      expect(audit.logActionAsync).toHaveBeenCalledWith(1, 'DELETE_UTM', 'utm', 1, expect.any(Object), null);
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
});
