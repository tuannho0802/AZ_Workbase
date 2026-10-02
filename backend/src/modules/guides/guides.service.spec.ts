import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { GuidesService, GuideCaller } from './guides.service';
import { Role } from '../../common/enums/role.enum';
import { Guide } from '../../database/entities/guide.entity';
import { GuideRole } from '../../database/entities/guide-role.entity';
import { GuidePosition } from '../../database/entities/guide-position.entity';
import { GuideDepartment } from '../../database/entities/guide-department.entity';
import { GuidePermission } from '../../database/entities/guide-permission.entity';

const mkGuide = (
  { requiredPermissions = [], ...over }: Record<string, unknown> & { requiredPermissions?: string[] } = {},
  roleIds: number[] = [],
  positionIds: number[] = [],
  departmentIds: number[] = [],
) => ({
  id: 1,
  title: 'Thêm khách hàng',
  slug: 'them-khach-hang',
  content: '# Nội dung',
  sortOrder: 0,
  isPublished: true,
  createdBy: 1,
  updatedBy: null,
  guideRoles: roleIds.map((roleId) => ({ guideId: 1, roleId })),
  guidePositions: positionIds.map((positionId) => ({ guideId: 1, positionId })),
  guideDepartments: departmentIds.map((departmentId) => ({ guideId: 1, departmentId })),
  guidePermissions: requiredPermissions.map((permissionKey) => ({ guideId: 1, permissionKey })),
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...over,
});

describe('GuidesService', () => {
  let svc: GuidesService;
  const guideRepo: any = { find: jest.fn(), findOne: jest.fn() };
  const roleRepo: any = { find: jest.fn(), findOne: jest.fn() };
  const positionRepo: any = { find: jest.fn() };
  const departmentRepo: any = { find: jest.fn() };
  const userRepo: any = { findOne: jest.fn() };
  const permissionRepo: any = { find: jest.fn(), findOne: jest.fn() };
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

  const emp: GuideCaller = { id: 10, role: 'employee', departmentId: 5, positionId: 7 };
  const root: GuideCaller = { id: 1, role: Role.ADMIN, isRootAdmin: true };
  const ROLES = [
    { id: 2, code: 'manager', name: 'Quản lý', color: '#111' },
    { id: 4, code: 'employee', name: 'Nhân viên', color: '#222' },
  ];

  const POSITIONS = [
    { id: 7, code: 'sales', name: 'Sales', color: '#0a0' },
    { id: 8, code: 'media', name: 'Media', color: '#0b0' },
  ];
  const DEPARTMENTS = [
    { id: 5, name: 'Kinh doanh', color: '#a00' },
    { id: 6, name: 'Marketing', color: '#b00' },
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
    positionRepo.find.mockImplementation(async ({ where }: any) => {
      const ids: number[] = where?.id?._value ?? POSITIONS.map((p) => p.id);
      return POSITIONS.filter((p) => ids.includes(p.id));
    });
    departmentRepo.find.mockImplementation(async ({ where }: any) => {
      const ids: number[] = where?.id?._value ?? DEPARTMENTS.map((d) => d.id);
      return DEPARTMENTS.filter((d) => ids.includes(d.id));
    });
    guideRepo.findOne.mockResolvedValue(null);
    // validatePermissionKeys: find({ where: { key: In([...]) } }) -> chỉ trả key tồn tại (trừ 'ghost.key').
    permissionRepo.find.mockImplementation(async ({ where }: any) =>
      ((where?.key?._value ?? []) as string[]).filter((k) => k !== 'ghost.key').map((key) => ({ key })),
    );
    dataSource.transaction.mockImplementation(async (cb: any) => cb(txManager));
    txManager.create.mockImplementation((_e: unknown, x: unknown) => x);
    svc = new GuidesService(guideRepo, roleRepo, positionRepo, departmentRepo, userRepo, permissionRepo, dataSource, perms, audit);
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

  describe('phạm vi theo vị trí / phòng ban', () => {
    it('listVisible: lọc theo vị trí + phòng ban của người gọi (AND), chiều rỗng không chặn', async () => {
      guideRepo.find.mockResolvedValue([
        mkGuide({ id: 1, slug: 'tat-ca' }, [], [], []),
        mkGuide({ id: 2, slug: 'sales' }, [], [7], []),
        mkGuide({ id: 3, slug: 'media' }, [], [8], []),
        mkGuide({ id: 4, slug: 'kd' }, [], [], [5]),
        mkGuide({ id: 5, slug: 'mkt' }, [], [], [6]),
        mkGuide({ id: 6, slug: 'sales-mkt' }, [], [7], [6]),
      ]);
      const res = await svc.listVisible(emp); // employee, vị trí 7 (Sales), phòng ban 5
      expect(res.map((g) => g.slug)).toEqual(['tat-ca', 'sales', 'kd']);
    });
    it('người không có vị trí/phòng ban không thấy guide đã giới hạn theo chiều đó', async () => {
      guideRepo.find.mockResolvedValue([
        mkGuide({ id: 1, slug: 'tat-ca' }),
        mkGuide({ id: 2, slug: 'sales' }, [], [7]),
        mkGuide({ id: 3, slug: 'kd' }, [], [], [5]),
      ]);
      const res = await svc.listVisible({ id: 11, role: 'employee', departmentId: null, positionId: null });
      expect(res.map((g) => g.slug)).toEqual(['tat-ca']);
    });
    it('getBySlug: sai vị trí -> 404; đúng -> kèm positions/departments có màu', async () => {
      guideRepo.findOne.mockResolvedValue(mkGuide({}, [], [8]));
      await expect(svc.getBySlug('them-khach-hang', emp)).rejects.toBeInstanceOf(NotFoundException);
      guideRepo.findOne.mockResolvedValue(mkGuide({}, [], [7], [5]));
      const res = await svc.getBySlug('them-khach-hang', emp);
      expect(res.positions).toEqual([{ id: 7, code: 'sales', name: 'Sales', color: '#0a0' }]);
      expect(res.departments).toEqual([{ id: 5, name: 'Kinh doanh', color: '#a00' }]);
      expect(res.positionIds).toEqual([7]);
      expect(res.departmentIds).toEqual([5]);
    });
    it('guides.manage thấy mọi guide đã xuất bản dù sai vị trí/phòng ban', async () => {
      canManage = true;
      guideRepo.find.mockResolvedValue([mkGuide({ id: 1, slug: 'a' }, [], [8], [6])]);
      expect((await svc.listVisible(emp)).map((g) => g.slug)).toEqual(['a']);
    });
    it('listManage: kèm nhãn + màu role/vị trí/phòng ban', async () => {
      guideRepo.find.mockResolvedValue([mkGuide({}, [2], [8], [6])]);
      const [item] = await svc.listManage();
      expect(item.roles[0].color).toBe('#111');
      expect(item.positions[0].color).toBe('#0b0');
      expect(item.departments[0].color).toBe('#b00');
    });
    it('listPositionOptions / listDepartmentOptions trả id, tên, màu', async () => {
      positionRepo.find.mockResolvedValueOnce([POSITIONS[0]]);
      departmentRepo.find.mockResolvedValueOnce([DEPARTMENTS[0]]);
      expect(await svc.listPositionOptions()).toEqual([{ id: 7, code: 'sales', name: 'Sales', color: '#0a0' }]);
      expect(await svc.listDepartmentOptions()).toEqual([{ id: 5, name: 'Kinh doanh', color: '#a00' }]);
    });
    it('create: ghi guide_positions + guide_departments; vị trí/phòng ban không tồn tại -> 400', async () => {
      txManager.save.mockResolvedValue({ id: 7 });
      guideRepo.findOne.mockImplementation(async ({ where }: any) => (where.id === 7 ? mkGuide({ id: 7 }, [], [7], [5]) : null));
      await svc.create({ title: 'A', content: 'x', positionIds: [7], departmentIds: [5] }, root);
      expect(txManager.insert).toHaveBeenCalledWith(GuidePosition, [{ guideId: 7, positionId: 7 }]);
      expect(txManager.insert).toHaveBeenCalledWith(GuideDepartment, [{ guideId: 7, departmentId: 5 }]);
      await expect(svc.create({ title: 'B', content: 'x', positionIds: [999] }, root)).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.create({ title: 'C', content: 'x', departmentIds: [999] }, root)).rejects.toBeInstanceOf(BadRequestException);
    });
    it('update: không gửi positionIds/departmentIds = giữ nguyên; gửi [] = xoá; gửi mảng = thay thế', async () => {
      guideRepo.findOne.mockImplementation(async ({ where }: any) => (where.id === 1 ? mkGuide({ id: 1 }, [], [7], [5]) : null));
      await svc.update(1, { isPublished: false }, root);
      expect(txManager.delete).not.toHaveBeenCalled();
      txManager.delete.mockClear();
      await svc.update(1, { positionIds: [], departmentIds: [6] }, root);
      expect(txManager.delete).toHaveBeenCalledWith(GuidePosition, { guideId: 1 });
      expect(txManager.delete).toHaveBeenCalledWith(GuideDepartment, { guideId: 1 });
      expect(txManager.delete).not.toHaveBeenCalledWith(GuideRole, expect.anything());
      expect(txManager.insert).toHaveBeenCalledWith(GuideDepartment, [{ guideId: 1, departmentId: 6 }]);
      expect(txManager.insert).not.toHaveBeenCalledWith(GuidePosition, expect.anything());
    });
    it('audit gồm positionIds/departmentIds', async () => {
      guideRepo.findOne.mockImplementation(async ({ where }: any) => (where.id === 1 ? mkGuide({ id: 1 }, [], [7], [5]) : null));
      await svc.update(1, { title: 'Mới' }, root);
      const [, , , , oldD, newD] = audit.logActionAsync.mock.calls[0];
      expect(oldD.positionIds).toEqual([7]);
      expect(newD.departmentIds).toEqual([5]);
    });
  });

  describe('D2/P0a - guide yêu cầu permission (requiredPermissions, AND)', () => {
    /** Chỉ `customers.assign` được cấp; guides.manage KHÔNG được cấp (không bypass). */
    const grantOnly = (...keys: string[]) =>
      perms.hasPermission.mockImplementation(async (_role: string, key: string) => ({ allowed: keys.includes(key), scope: null }));

    it('listVisible: ẩn guide cần quyền mà người xem không có; hiện khi có quyền', async () => {
      guideRepo.find.mockResolvedValue([
        mkGuide({ id: 1, slug: 'free' }),
        mkGuide({ id: 2, slug: 'assign', requiredPermissions: ['customers.assign'] }),
        mkGuide({ id: 3, slug: 'roles', requiredPermissions: ['roles.view'] }),
      ]);
      grantOnly('customers.assign');
      expect((await svc.listVisible(emp)).map((g) => g.slug)).toEqual(['free', 'assign']);
      grantOnly();
      expect((await svc.listVisible(emp)).map((g) => g.slug)).toEqual(['free']);
    });

    it('hỏi quyền theo role + phòng ban + vị trí của người xem, mỗi key khác nhau chỉ hỏi 1 lần', async () => {
      guideRepo.find.mockResolvedValue([
        mkGuide({ id: 1, slug: 'a', requiredPermissions: ['customers.assign'] }),
        mkGuide({ id: 2, slug: 'b', requiredPermissions: ['customers.assign'] }),
        mkGuide({ id: 3, slug: 'c' }),
      ]);
      grantOnly('customers.assign');
      await svc.listVisible(emp);
      const asked = perms.hasPermission.mock.calls.filter((c: any[]) => c[1] === 'customers.assign');
      expect(asked).toHaveLength(1);
      expect(asked[0]).toEqual(['employee', 'customers.assign', 5, 7]);
    });

    it('AND với chiều role: có quyền nhưng sai role vẫn ẩn', async () => {
      guideRepo.find.mockResolvedValue([mkGuide({ id: 1, slug: 'a', requiredPermissions: ['customers.assign'] }, [2])]);
      grantOnly('customers.assign');
      expect(await svc.listVisible(emp)).toEqual([]);
    });

    it('người có guides.manage thấy hết dù thiếu quyền yêu cầu (xem trước)', async () => {
      guideRepo.find.mockResolvedValue([mkGuide({ id: 1, slug: 'a', requiredPermissions: ['roles.view'] })]);
      grantOnly('guides.manage');
      expect((await svc.listVisible(emp)).map((g) => g.slug)).toEqual(['a']);
    });

    it('Root Admin thấy mọi guide cần quyền và không phải hỏi từng key', async () => {
      guideRepo.find.mockResolvedValue([mkGuide({ id: 1, slug: 'a', requiredPermissions: ['roles.view'] })]);
      grantOnly();
      expect((await svc.listVisible(root)).map((g) => g.slug)).toEqual(['a']);
      expect(perms.hasPermission).not.toHaveBeenCalled();
    });

    it('key không còn tồn tại/không ai có -> ẩn với người không có guides.manage (an toàn mặc định)', async () => {
      guideRepo.find.mockResolvedValue([mkGuide({ id: 1, slug: 'a', requiredPermissions: ['ghost.key'] })]);
      grantOnly();
      expect(await svc.listVisible(emp)).toEqual([]);
    });

    it('getBySlug: thiếu quyền -> 404; đủ quyền -> trả bài kèm requiredPermissions', async () => {
      guideRepo.findOne.mockResolvedValue(mkGuide({ requiredPermissions: ['customers.assign'] }));
      grantOnly();
      await expect(svc.getBySlug('them-khach-hang', emp)).rejects.toBeInstanceOf(NotFoundException);
      grantOnly('customers.assign');
      const res = await svc.getBySlug('them-khach-hang', emp);
      expect(res.requiredPermissions).toEqual(['customers.assign']);
    });

    it('guide cũ (không yêu cầu quyền) không bị ảnh hưởng', async () => {
      guideRepo.find.mockResolvedValue([mkGuide({ id: 1, slug: 'a' })]);
      grantOnly();
      expect((await svc.listVisible(emp)).map((g) => g.slug)).toEqual(['a']);
    });

    it('NHIỀU quyền = AND: thiếu 1 trong các quyền là ẩn; đủ tất cả mới hiện; mỗi key chỉ hỏi 1 lần', async () => {
      guideRepo.find.mockResolvedValue([
        mkGuide({ id: 1, slug: 'both', requiredPermissions: ['customers.assign', 'customers.edit'] }),
        mkGuide({ id: 2, slug: 'edit', requiredPermissions: ['customers.edit'] }),
      ]);
      grantOnly('customers.assign');
      expect(await svc.listVisible(emp)).toEqual([]);
      grantOnly('customers.assign', 'customers.edit');
      perms.hasPermission.mockClear();
      expect((await svc.listVisible(emp)).map((g) => g.slug)).toEqual(['both', 'edit']);
      expect(perms.hasPermission.mock.calls.filter((c: any[]) => c[1] === 'customers.edit')).toHaveLength(1);
    });

    it('một key ma trong danh sách làm cả guide ẩn với người không có guides.manage', async () => {
      guideRepo.find.mockResolvedValue([mkGuide({ id: 1, slug: 'a', requiredPermissions: ['customers.assign', 'ghost.key'] })]);
      grantOnly('customers.assign');
      expect(await svc.listVisible(emp)).toEqual([]);
    });

    it('create: lưu nhiều quyền vào guide_permissions; có key không tồn tại -> 400 và không ghi gì', async () => {
      txManager.save.mockResolvedValue({ id: 7 });
      guideRepo.findOne.mockImplementation(async ({ where }: any) =>
        where.id === 7 ? mkGuide({ id: 7, requiredPermissions: ['customers.edit', 'customers.assign'] }) : null,
      );
      const res = await svc.create(
        { title: 'A', content: 'x', requiredPermissions: ['customers.edit', 'customers.assign', 'customers.edit'] },
        root,
      );
      const inserted = txManager.insert.mock.calls.find((c: any[]) => c[0] === GuidePermission);
      expect(inserted?.[1]).toEqual([
        { guideId: 7, permissionKey: 'customers.edit' },
        { guideId: 7, permissionKey: 'customers.assign' },
      ]);
      expect(res.requiredPermissions).toEqual(['customers.assign', 'customers.edit']);
      txManager.create.mockClear();
      await expect(
        svc.create({ title: 'B', content: 'x', requiredPermissions: ['customers.assign', 'ghost.key'] }, root),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(txManager.create).not.toHaveBeenCalled();
    });

    it('create: không gửi -> không ghi dòng guide_permissions nào', async () => {
      txManager.save.mockResolvedValue({ id: 7 });
      guideRepo.findOne.mockImplementation(async ({ where }: any) => (where.id === 7 ? mkGuide({ id: 7 }) : null));
      await svc.create({ title: 'A', content: 'x' }, root);
      expect(txManager.insert.mock.calls.some((c: any[]) => c[0] === GuidePermission)).toBe(false);
    });

    it('update: không gửi = giữ nguyên; [] = bỏ yêu cầu; danh sách mới = thay thế; key ma -> 400', async () => {
      guideRepo.findOne.mockImplementation(async ({ where }: any) =>
        where.id === 1 ? mkGuide({ id: 1, requiredPermissions: ['customers.assign'] }) : null,
      );
      const deletedPerms = () => txManager.delete.mock.calls.some((c: any[]) => c[0] === GuidePermission);
      const insertedPerms = () => txManager.insert.mock.calls.find((c: any[]) => c[0] === GuidePermission)?.[1];

      await svc.update(1, { title: 'Mới' }, root);
      expect(deletedPerms()).toBe(false);
      expect(insertedPerms()).toBeUndefined();

      txManager.delete.mockClear();
      txManager.insert.mockClear();
      await svc.update(1, { requiredPermissions: [] }, root);
      expect(deletedPerms()).toBe(true);
      expect(insertedPerms()).toBeUndefined();

      txManager.delete.mockClear();
      txManager.insert.mockClear();
      await svc.update(1, { requiredPermissions: ['roles.view', 'customers.edit'] }, root);
      expect(deletedPerms()).toBe(true);
      expect(insertedPerms()).toEqual([
        { guideId: 1, permissionKey: 'roles.view' },
        { guideId: 1, permissionKey: 'customers.edit' },
      ]);

      txManager.update.mockClear();
      await expect(svc.update(1, { requiredPermissions: ['ghost.key'] }, root)).rejects.toBeInstanceOf(BadRequestException);
      expect(txManager.update).not.toHaveBeenCalled();
    });

    it('audit ghi requiredPermissions trước/sau', async () => {
      guideRepo.findOne.mockImplementation(async ({ where }: any) =>
        where.id === 1 ? mkGuide({ id: 1, requiredPermissions: ['customers.assign'] }) : null,
      );
      await svc.update(1, { title: 'Mới' }, root);
      const [, , , , oldD, newD] = audit.logActionAsync.mock.calls[0];
      expect(oldD.requiredPermissions).toEqual(['customers.assign']);
      expect(newD).toHaveProperty('requiredPermissions');
    });

    it('listPermissionOptions trả key/resource/action/description theo thứ tự đọc từ bảng permissions', async () => {
      permissionRepo.find.mockResolvedValue([
        { id: 1, key: 'customers.assign', resource: 'customers', action: 'assign', description: 'Chia data', supportsScope: true },
      ]);
      expect(await svc.listPermissionOptions()).toEqual([
        { key: 'customers.assign', resource: 'customers', action: 'assign', description: 'Chia data' },
      ]);
      expect(permissionRepo.find.mock.calls[0][0].order).toEqual({ resource: 'ASC', action: 'ASC' });
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
