import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { GuidesService, GuideCaller } from './guides.service';
import { Role } from '../../common/enums/role.enum';
import { Guide } from '../../database/entities/guide.entity';
import { GuideRole } from '../../database/entities/guide-role.entity';

const mkGuide = (over: Record<string, unknown> = {}, roleIds: number[] = []) => ({
  id: 1,
  title: 'Thêm khách hàng',
  slug: 'them-khach-hang',
  content: '# Nội dung',
  sortOrder: 0,
  isPublished: true,
  createdBy: 1,
  updatedBy: null,
  guideRoles: roleIds.map((roleId) => ({ guideId: 1, roleId })),
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...over,
});

describe('GuidesService', () => {
  let svc: GuidesService;
  const guideRepo: any = { find: jest.fn(), findOne: jest.fn() };
  const roleRepo: any = { find: jest.fn(), findOne: jest.fn() };
  const txManager: any = {
    save: jest.fn(),
    create: jest.fn((_e: unknown, x: unknown) => x),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    softDelete: jest.fn(),
  };
  const dataSource: any = { transaction: jest.fn(async (cb: any) => cb(txManager)) };
  const perms: any = { hasPermission: jest.fn() };
  const audit: any = { logActionAsync: jest.fn() };
  let canManage: boolean;

  const emp: GuideCaller = { id: 10, role: 'employee', departmentId: 5 };
  const root: GuideCaller = { id: 1, role: Role.ADMIN, isRootAdmin: true };
  const ROLES = [
    { id: 2, code: 'manager', name: 'Quản lý', color: '#111' },
    { id: 4, code: 'employee', name: 'Nhân viên', color: '#222' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    canManage = false;
    perms.hasPermission.mockImplementation(async () => ({ allowed: canManage, scope: null }));
    roleRepo.findOne.mockResolvedValue({ id: 4 });
    roleRepo.find.mockImplementation(async ({ where }: any) => {
      const ids: number[] = where.id._value ?? [];
      return ROLES.filter((r) => ids.includes(r.id));
    });
    guideRepo.findOne.mockResolvedValue(null);
    dataSource.transaction.mockImplementation(async (cb: any) => cb(txManager));
    txManager.create.mockImplementation((_e: unknown, x: unknown) => x);
    svc = new GuidesService(guideRepo, roleRepo, dataSource, perms, audit);
  });

  describe('canManage', () => {
    it('Root Admin luôn có, không hỏi DB', async () => {
      expect(await svc.canManage(root)).toBe(true);
      expect(perms.hasPermission).not.toHaveBeenCalled();
    });
    it('admin thường (không root) phải qua role_permissions', async () => {
      expect(await svc.canManage({ id: 2, role: Role.ADMIN, isRootAdmin: false })).toBe(false);
      expect(perms.hasPermission).toHaveBeenCalledWith('admin', 'guides.manage', undefined, undefined);
    });
    it('user được cấp guides.manage thì có', async () => {
      canManage = true;
      expect(await svc.canManage(emp)).toBe(true);
    });
  });

  describe('listVisible', () => {
    beforeEach(() => {
      guideRepo.find.mockResolvedValue([
        mkGuide({ id: 1, slug: 'a' }, []),
        mkGuide({ id: 2, slug: 'b' }, [2]),
        mkGuide({ id: 3, slug: 'c' }, [4]),
      ]);
    });
    it('employee (role 4) chỉ thấy guide không gán role + guide gán role mình', async () => {
      const res = await svc.listVisible(emp);
      expect(res.map((g) => g.slug)).toEqual(['a', 'c']);
    });
    it('mục lục không kèm nội dung', async () => {
      const res = await svc.listVisible(emp);
      expect(res[0]).not.toHaveProperty('content');
    });
    it('người có guides.manage thấy mọi guide đã xuất bản', async () => {
      canManage = true;
      expect((await svc.listVisible(emp)).map((g) => g.slug)).toEqual(['a', 'b', 'c']);
    });
    it('chỉ truy vấn guide đã xuất bản', async () => {
      await svc.listVisible(emp);
      expect(guideRepo.find.mock.calls[0][0].where).toEqual({ isPublished: true });
    });
  });

  describe('getBySlug', () => {
    it('không tồn tại -> 404', async () => {
      await expect(svc.getBySlug('x', emp)).rejects.toBeInstanceOf(NotFoundException);
    });
    it('bản nháp -> 404 kể cả người có guides.manage', async () => {
      canManage = true;
      guideRepo.findOne.mockResolvedValue(mkGuide({ isPublished: false }));
      await expect(svc.getBySlug('them-khach-hang', emp)).rejects.toBeInstanceOf(NotFoundException);
    });
    it('sai role -> 404 (không lộ sự tồn tại, không 403)', async () => {
      guideRepo.findOne.mockResolvedValue(mkGuide({}, [2]));
      await expect(svc.getBySlug('them-khach-hang', emp)).rejects.toBeInstanceOf(NotFoundException);
    });
    it('đúng role -> trả nội dung kèm danh sách role', async () => {
      guideRepo.findOne.mockResolvedValue(mkGuide({}, [4]));
      const res = await svc.getBySlug('them-khach-hang', emp);
      expect(res.content).toBe('# Nội dung');
      expect(res.roles.map((r) => r.code)).toEqual(['employee']);
    });
    it('không gán role -> mọi role xem được', async () => {
      guideRepo.findOne.mockResolvedValue(mkGuide({}, []));
      await expect(svc.getBySlug('them-khach-hang', emp)).resolves.toBeDefined();
    });
  });

  describe('create', () => {
    const base = { title: ' Thêm khách hàng ', content: '# Hi' };
    beforeEach(() => {
      txManager.save.mockResolvedValue({ id: 7 });
      // slug rảnh; sau khi lưu thì getManageDetail(7) đọc lại
      guideRepo.findOne.mockImplementation(async ({ where }: any) =>
        where.id === 7 ? mkGuide({ id: 7, slug: 'them-khach-hang' }, [2]) : null,
      );
    });
    it('tự sinh slug từ tiêu đề, trim tiêu đề, mặc định nháp + createdBy', async () => {
      await svc.create({ ...base, roleIds: [2] }, root);
      const created = txManager.create.mock.calls[0][1];
      expect(created).toMatchObject({
        title: 'Thêm khách hàng',
        slug: 'them-khach-hang',
        isPublished: false,
        sortOrder: 0,
        createdBy: 1,
      });
      expect(txManager.insert).toHaveBeenCalledWith(GuideRole, [{ guideId: 7, roleId: 2 }]);
    });
    it('không gán role -> không insert guide_roles', async () => {
      await svc.create(base, root);
      expect(txManager.insert).not.toHaveBeenCalled();
    });
    it('slug tự sinh trùng -> thêm hậu tố -2', async () => {
      guideRepo.findOne.mockImplementation(async ({ where }: any) => {
        if (where.id === 7) return mkGuide({ id: 7 });
        return where.slug === 'them-khach-hang' ? { id: 99 } : null;
      });
      await svc.create(base, root);
      expect(txManager.create.mock.calls[0][1].slug).toBe('them-khach-hang-2');
    });
    it('slug nhập tay bị trùng (kể cả bản đã xoá mềm) -> 409', async () => {
      guideRepo.findOne.mockResolvedValue({ id: 99 });
      await expect(svc.create({ ...base, slug: 'da-co' }, root)).rejects.toBeInstanceOf(ConflictException);
      expect(guideRepo.findOne.mock.calls[0][0].withDeleted).toBe(true);
    });
    it('slug "manage" bị chặn (trùng route tĩnh)', async () => {
      await expect(svc.create({ ...base, slug: 'manage' }, root)).rejects.toBeInstanceOf(ConflictException);
    });
    it('tiêu đề/nội dung chỉ toàn khoảng trắng -> 400', async () => {
      await expect(svc.create({ title: '   ', content: 'x' }, root)).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.create({ title: 'a', content: '  \n ' }, root)).rejects.toBeInstanceOf(BadRequestException);
    });
    it('role không tồn tại -> 400, không ghi gì', async () => {
      await expect(svc.create({ ...base, roleIds: [2, 999] }, root)).rejects.toBeInstanceOf(BadRequestException);
      expect(txManager.save).not.toHaveBeenCalled();
    });
    it('race slug: DB ER_DUP_ENTRY -> 409 thay vì 500', async () => {
      txManager.save.mockRejectedValue({ code: 'ER_DUP_ENTRY', errno: 1062 });
      await expect(svc.create(base, root)).rejects.toBeInstanceOf(ConflictException);
    });
    it('ghi audit CREATE_GUIDE (không nhét nguyên nội dung, chỉ độ dài)', async () => {
      await svc.create({ ...base, roleIds: [2] }, root);
      const [uid, action, type, id, oldD, newD] = audit.logActionAsync.mock.calls[0];
      expect([uid, action, type, id, oldD]).toEqual([1, 'CREATE_GUIDE', 'guide', 7, null]);
      expect(newD).not.toHaveProperty('content');
      expect(newD.contentLength).toBeGreaterThan(0);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      guideRepo.findOne.mockImplementation(async ({ where }: any) =>
        where.id === 1 ? mkGuide({ id: 1 }, [2]) : null,
      );
    });
    it('không tồn tại -> 404', async () => {
      await expect(svc.update(99, { title: 'x' }, root)).rejects.toBeInstanceOf(NotFoundException);
    });
    it('chỉ cập nhật trường được gửi + updatedBy; không đụng guide_roles khi không gửi roleIds', async () => {
      await svc.update(1, { isPublished: false }, root);
      expect(txManager.update).toHaveBeenCalledWith(Guide, { id: 1 }, { isPublished: false, updatedBy: 1 });
      expect(txManager.delete).not.toHaveBeenCalled();
      expect(txManager.insert).not.toHaveBeenCalled();
    });
    it('roleIds: [] -> xoá hết role (mọi role xem được)', async () => {
      await svc.update(1, { roleIds: [] }, root);
      expect(txManager.delete).toHaveBeenCalledWith(GuideRole, { guideId: 1 });
      expect(txManager.insert).not.toHaveBeenCalled();
    });
    it('roleIds mới -> thay thế toàn bộ', async () => {
      await svc.update(1, { roleIds: [4] }, root);
      expect(txManager.delete).toHaveBeenCalledWith(GuideRole, { guideId: 1 });
      expect(txManager.insert).toHaveBeenCalledWith(GuideRole, [{ guideId: 1, roleId: 4 }]);
    });
    it('đổi slug sang slug của guide khác -> 409; giữ nguyên slug của chính nó thì OK', async () => {
      guideRepo.findOne.mockImplementation(async ({ where }: any) => {
        if (where.id === 1) return mkGuide({ id: 1 }, []);
        return where.slug === 'khac' ? { id: 55 } : null;
      });
      await expect(svc.update(1, { slug: 'khac' }, root)).rejects.toBeInstanceOf(ConflictException);
      await expect(svc.update(1, { slug: 'them-khach-hang' }, root)).resolves.toBeDefined();
    });
    it('role không tồn tại -> 400, không ghi gì', async () => {
      await expect(svc.update(1, { roleIds: [999] }, root)).rejects.toBeInstanceOf(BadRequestException);
      expect(txManager.update).not.toHaveBeenCalled();
    });
    it('ghi audit UPDATE_GUIDE có before/after', async () => {
      await svc.update(1, { title: 'Mới' }, root);
      const [, action, , id, oldD, newD] = audit.logActionAsync.mock.calls[0];
      expect([action, id]).toEqual(['UPDATE_GUIDE', 1]);
      expect(oldD.title).toBe('Thêm khách hàng');
      expect(newD).toHaveProperty('contentChanged', false);
    });
  });

  describe('remove', () => {
    it('không tồn tại -> 404', async () => {
      await expect(svc.remove(9, root)).rejects.toBeInstanceOf(NotFoundException);
    });
    it('xoá mềm + giải phóng slug + audit lưu NGUYÊN VĂN (kể cả nội dung, role) trước khi xoá', async () => {
      guideRepo.findOne.mockResolvedValue(mkGuide({ id: 1 }, [2, 4]));
      await expect(svc.remove(1, root)).resolves.toEqual({ success: true });
      expect(txManager.update).toHaveBeenCalledWith(
        Guide,
        { id: 1 },
        { slug: 'deleted-1-them-khach-hang', updatedBy: 1 },
      );
      expect(txManager.softDelete).toHaveBeenCalledWith(Guide, { id: 1 });
      const [, action, , , oldD, newD] = audit.logActionAsync.mock.calls[0];
      expect(action).toBe('DELETE_GUIDE');
      expect(oldD).toMatchObject({ id: 1, content: '# Nội dung', slug: 'them-khach-hang', roleIds: [2, 4] });
      expect(newD).toBeNull();
    });
    it('slug giải phóng không vượt độ dài cột', async () => {
      guideRepo.findOne.mockResolvedValue(mkGuide({ id: 123, slug: 'a'.repeat(150) }, []));
      await svc.remove(123, root);
      expect(txManager.update.mock.calls[0][2].slug.length).toBeLessThanOrEqual(150);
    });
  });

  describe('listManage / getManageDetail', () => {
    it('danh sách quản trị gồm nháp, kèm role, không kèm nội dung', async () => {
      guideRepo.find.mockResolvedValue([mkGuide({ isPublished: false }, [2]), mkGuide({ id: 2, slug: 'b' }, [])]);
      const res = await svc.listManage();
      expect(res).toHaveLength(2);
      expect(res[0].isPublished).toBe(false);
      expect(res[0].roles.map((r) => r.id)).toEqual([2]);
      expect(res[0]).not.toHaveProperty('content');
    });
    it('listRoleOptions trả id/code/name/color, sắp theo id', async () => {
      roleRepo.find.mockResolvedValueOnce([{ id: 1, code: 'admin', name: 'Admin', color: '#f00', isSystem: true }]);
      const res = await svc.listRoleOptions();
      expect(roleRepo.find).toHaveBeenLastCalledWith({ order: { id: 'ASC' } });
      expect(res).toEqual([{ id: 1, code: 'admin', name: 'Admin', color: '#f00' }]);
    });
    it('chi tiết theo id không tồn tại -> 404', async () => {
      await expect(svc.getManageDetail(5)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
