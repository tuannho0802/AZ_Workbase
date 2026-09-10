import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RoleEntity } from '../../database/entities/role.entity';
import { Permission } from '../../database/entities/permission.entity';
import { RolePermission, PermissionScope } from '../../database/entities/role-permission.entity';
import { User } from '../../database/entities/user.entity';
import { Position } from '../../database/entities/position.entity';
import { DataSource } from 'typeorm';
import { PermissionsService } from '../permissions/permissions.service';

describe('RolesService', () => {
  let service: RolesService;

  const mockRoleRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const mockPermissionRepo = {
    find: jest.fn(),
  };
  const mockRolePermissionRepo = {
    delete: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    exists: jest.fn(),
  };
  const mockUserRepo = {
    count: jest.fn(),
  };
  const mockPositionRepo = {
    findOneBy: jest.fn(),
  };
  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      find: jest.fn(),
      delete: jest.fn(),
      save: jest.fn(),
    },
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    transaction: jest.fn((cb) =>
      cb({
        delete: jest.fn(),
        create: jest.fn((_entity, data) => data),
        save: jest.fn(),
        update: jest.fn().mockResolvedValue({ affected: 3 }),
        remove: jest.fn(),
      }),
    ),
  };
  const mockPermissionsService = {
    invalidate: jest.fn(),
    getRolePermissions: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: getRepositoryToken(RoleEntity), useValue: mockRoleRepo },
        { provide: getRepositoryToken(Permission), useValue: mockPermissionRepo },
        { provide: getRepositoryToken(RolePermission), useValue: mockRolePermissionRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Position), useValue: mockPositionRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: PermissionsService, useValue: mockPermissionsService },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  describe('createRole', () => {
    it('tạo role mới thành công khi code chưa tồn tại', async () => {
      mockRoleRepo.findOne.mockResolvedValue(null);
      mockRoleRepo.create.mockReturnValue({ code: 'mkt_manager', isSystem: false });
      mockRoleRepo.save.mockResolvedValue({ id: 5, code: 'mkt_manager', isSystem: false });

      const result = await service.createRole({
        code: 'mkt_manager',
        name: 'Trưởng phòng Marketing',
      });

      expect(mockRoleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'mkt_manager', isSystem: false }),
      );
      expect(result).toEqual({ id: 5, code: 'mkt_manager', isSystem: false });
    });

    it('từ chối khi code đã tồn tại', async () => {
      mockRoleRepo.findOne.mockResolvedValue({ id: 1, code: 'admin' });

      await expect(
        service.createRole({ code: 'admin', name: 'Trùng' }),
      ).rejects.toThrow(ConflictException);
      expect(mockRoleRepo.save).not.toHaveBeenCalled();
    });

    it('role mới luôn tạo với isSystem=false, kể cả nếu DTO không truyền gì thêm', async () => {
      mockRoleRepo.findOne.mockResolvedValue(null);
      mockRoleRepo.create.mockImplementation((data) => data);
      mockRoleRepo.save.mockImplementation((data) => Promise.resolve({ id: 1, ...data }));

      await service.createRole({ code: 'sales_lead', name: 'Trưởng nhóm Sales' });

      expect(mockRoleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ isSystem: false }),
      );
    });
  });

  describe('deleteRole', () => {
    it('từ chối xoá role hệ thống (isSystem=true)', async () => {
      mockRoleRepo.findOne.mockResolvedValue({ id: 1, code: 'admin', isSystem: true, name: 'Admin' });

      await expect(service.deleteRole(1)).rejects.toThrow(BadRequestException);
      expect(mockRoleRepo.remove).not.toHaveBeenCalled();
    });

    it('tự động chuyển users sang employee khi xoá role có người dùng', async () => {
      const role = { id: 5, code: 'mkt_manager', isSystem: false, name: 'MKT Manager' };
      mockRoleRepo.findOne.mockResolvedValue(role);

      const result = await service.deleteRole(5);

      expect(result).toEqual({ deleted: true, usersReassigned: 3 });
      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockPermissionsService.invalidate).toHaveBeenCalledWith('mkt_manager');
      expect(mockPermissionsService.invalidate).toHaveBeenCalledWith('employee');
    });

    it('báo lỗi rõ ràng khi role không tồn tại', async () => {
      mockRoleRepo.findOne.mockResolvedValue(null);

      await expect(service.deleteRole(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateRolePermissions - validate dữ liệu', () => {
    beforeEach(() => {
      mockRoleRepo.findOne.mockResolvedValue({ id: 5, code: 'mkt_manager', isSystem: false });
      mockPermissionRepo.find.mockResolvedValue([
        { id: 1, key: 'customers.view', supportsScope: true },
        { id: 2, key: 'roles.manage', supportsScope: false },
      ]);
      mockRolePermissionRepo.count.mockResolvedValue(5); // mặc định: còn nhiều role khác giữ roles.manage
      mockRolePermissionRepo.exists.mockResolvedValue(false);
    });

    it('từ chối permission key không tồn tại trong danh mục', async () => {
      await expect(
        service.updateRolePermissions(5, {
          permissions: [{ permissionKey: 'khong_ton_tai', scope: PermissionScope.ALL }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('từ chối khi permission hỗ trợ scope mà không truyền scope', async () => {
      await expect(
        service.updateRolePermissions(5, {
          permissions: [{ permissionKey: 'customers.view' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('từ chối khi permission KHÔNG hỗ trợ scope mà vẫn truyền scope', async () => {
      await expect(
        service.updateRolePermissions(5, {
          permissions: [{ permissionKey: 'roles.manage', scope: PermissionScope.ALL }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('từ chối scope="none" trên ma trận Toàn cục (chỉ hợp lệ ở Override phòng ban)', async () => {
      await expect(
        service.updateRolePermissions(5, {
          permissions: [{ permissionKey: 'customers.view', scope: PermissionScope.NONE }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateRolePermissions - chống khoá trang phân quyền', () => {
    beforeEach(() => {
      mockRoleRepo.findOne.mockResolvedValue({ id: 1, code: 'admin', isSystem: true });
      mockPermissionRepo.find.mockResolvedValue([
        { id: 1, key: 'customers.view', supportsScope: true },
        { id: 2, key: 'roles.manage', supportsScope: false },
      ]);
      // updateRolePermissions() trả về kết quả cuối qua findAllRoles() -
      // cần mock luôn 2 nguồn dữ liệu đó, độc lập với các mock riêng của
      // từng test case (count/exists) ở trên.
      mockRoleRepo.find.mockResolvedValue([{ id: 1, code: 'admin', isSystem: true }]);
      mockRolePermissionRepo.find.mockResolvedValue([]);
    });

    it('CHẶN gỡ roles.manage khỏi role DUY NHẤT đang giữ quyền này', async () => {
      mockRolePermissionRepo.exists.mockResolvedValue(true); // role đang sửa hiện đang giữ roles.manage
      mockRolePermissionRepo.count.mockResolvedValue(1); // chỉ 1 role (chính nó) giữ quyền này

      await expect(
        service.updateRolePermissions(1, {
          permissions: [{ permissionKey: 'customers.view', scope: PermissionScope.ALL }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('CHO PHÉP gỡ roles.manage nếu còn role KHÁC giữ quyền này', async () => {
      mockRolePermissionRepo.exists.mockResolvedValue(true);
      mockRolePermissionRepo.count.mockResolvedValue(2); // admin + 1 role khác đều đang giữ

      await expect(
        service.updateRolePermissions(1, {
          permissions: [{ permissionKey: 'customers.view', scope: PermissionScope.ALL }],
        }),
      ).resolves.not.toThrow();
    });

    it('CHO PHÉP giữ nguyên roles.manage trong danh sách mới (không đụng tới an toàn)', async () => {
      mockRolePermissionRepo.exists.mockResolvedValue(true);
      mockRolePermissionRepo.count.mockResolvedValue(1);

      await expect(
        service.updateRolePermissions(1, {
          permissions: [
            { permissionKey: 'customers.view', scope: PermissionScope.ALL },
            { permissionKey: 'roles.manage' },
          ],
        }),
      ).resolves.not.toThrow();
    });

    it('không chặn nếu role đang sửa VỐN KHÔNG giữ roles.manage (không phải nguồn duy nhất)', async () => {
      mockRolePermissionRepo.exists.mockResolvedValue(false); // role này chưa từng có roles.manage
      mockRolePermissionRepo.count.mockResolvedValue(1); // role khác đang giữ

      await expect(
        service.updateRolePermissions(1, {
          permissions: [{ permissionKey: 'customers.view', scope: PermissionScope.ALL }],
        }),
      ).resolves.not.toThrow();
    });

    it('sau khi update thành công, gọi invalidate() đúng role code', async () => {
      mockRolePermissionRepo.exists.mockResolvedValue(true);
      mockRolePermissionRepo.count.mockResolvedValue(3);
      mockRoleRepo.find.mockResolvedValue([{ id: 1, code: 'admin', isSystem: true }]);

      await service.updateRolePermissions(1, {
        permissions: [{ permissionKey: 'roles.manage' }],
      });

      expect(mockPermissionsService.invalidate).toHaveBeenCalledWith('admin');
    });
    });
  describe('Department Overrides', () => {
    it('getDepartmentOverrides -> nhóm đúng theo phòng ban', async () => {
      mockRoleRepo.findOneBy.mockResolvedValue({ id: 1 });
      mockRolePermissionRepo.find.mockResolvedValue([
        { departmentId: 5, permission: { key: 'perm1' }, scope: null, department: { name: 'MKT' } },
        { departmentId: 5, permission: { key: 'perm2' }, scope: 'own', department: { name: 'MKT' } },
      ]);
      const res = await service.getDepartmentOverrides(1);
      expect(res).toHaveLength(1);
      expect(res[0].departmentId).toBe(5);
      expect(res[0].permissions).toHaveLength(2);
    });

    it('updateDepartmentOverride -> thành công, invalidate cache cho phòng đó', async () => {
      mockRoleRepo.findOneBy.mockResolvedValue({ id: 1, code: 'manager' });
      mockQueryRunner.manager.find.mockResolvedValue([
        { id: 10, key: 'customers.view', supportsScope: true },
      ]);
      
      const res = await service.updateDepartmentOverride(1, 5, {
        permissions: [{ permissionKey: 'customers.view', scope: 'department' as any }],
      });
      
      expect(res.success).toBe(true);
      expect(mockQueryRunner.manager.delete).toHaveBeenCalledWith(RolePermission, { roleId: 1, departmentId: 5 });
      expect(mockQueryRunner.manager.save).toHaveBeenCalled();
      expect(mockPermissionsService.invalidate).toHaveBeenCalledWith('manager', 5);
    });

    it('updateDepartmentOverride -> CHO PHÉP scope="none" (từ chối tường minh) dù permission hỗ trợ scope', async () => {
      mockRoleRepo.findOneBy.mockResolvedValue({ id: 1, code: 'employee' });
      mockQueryRunner.manager.find.mockResolvedValue([
        { id: 10, key: 'customers.edit', supportsScope: true },
      ]);

      const res = await service.updateDepartmentOverride(1, 5, {
        permissions: [{ permissionKey: 'customers.edit', scope: PermissionScope.NONE }],
      });

      expect(res.success).toBe(true);
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith([
        expect.objectContaining({ roleId: 1, departmentId: 5, permissionId: 10, scope: PermissionScope.NONE }),
      ]);
    });

    it('updateDepartmentOverride -> CHO PHÉP scope="none" trên permission nhị phân (KHÔNG hỗ trợ scope)', async () => {
      mockRoleRepo.findOneBy.mockResolvedValue({ id: 1, code: 'employee' });
      mockQueryRunner.manager.find.mockResolvedValue([
        { id: 11, key: 'link_groups.view', supportsScope: false },
      ]);

      await expect(
        service.updateDepartmentOverride(1, 5, {
          permissions: [{ permissionKey: 'link_groups.view', scope: PermissionScope.NONE }],
        }),
      ).resolves.toEqual({ success: true, count: 1 });
    });

    it('deleteDepartmentOverride -> xoá thành công, invalidate cache cho phòng đó', async () => {
      mockRoleRepo.findOneBy.mockResolvedValue({ id: 1, code: 'manager' });
      await service.deleteDepartmentOverride(1, 5);
      expect(mockRolePermissionRepo.delete).toHaveBeenCalledWith({ roleId: 1, departmentId: 5 });
      expect(mockPermissionsService.invalidate).toHaveBeenCalledWith('manager', 5);
    });
  });

  // ⚠️ COPY GẦN NHƯ Y HỆT khối 'Department Overrides' ở trên - chỉ đổi
  // departmentId -> positionId (xem PLAN_POSITION_FIELD_VISIBILITY_ASSIGNMENT_GROUPS.md
  // mục 2.2/3.3: Position là tầng override ưu tiên CAO NHẤT).
  describe('Position Overrides', () => {
    it('getPositionOverrides -> nhóm đúng theo vị trí', async () => {
      mockRoleRepo.findOneBy.mockResolvedValue({ id: 1 });
      mockRolePermissionRepo.find.mockResolvedValue([
        { positionId: 3, permission: { key: 'field:sales_assignment' }, scope: null, position: { name: 'Content' } },
        { positionId: 3, permission: { key: 'customers.view' }, scope: 'own', position: { name: 'Content' } },
      ]);
      const res = await service.getPositionOverrides(1);
      expect(res).toHaveLength(1);
      expect(res[0].positionId).toBe(3);
      expect(res[0].permissions).toHaveLength(2);
    });

    it('updatePositionOverride -> báo lỗi nếu Vị trí không tồn tại', async () => {
      mockRoleRepo.findOneBy.mockResolvedValue({ id: 1, code: 'employee' });
      mockPositionRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.updatePositionOverride(1, 999, {
          permissions: [{ permissionKey: 'customers.view', scope: 'own' as any }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updatePositionOverride -> thành công, invalidate cache cho vị trí đó (departmentId=undefined)', async () => {
      mockRoleRepo.findOneBy.mockResolvedValue({ id: 1, code: 'employee' });
      mockPositionRepo.findOneBy.mockResolvedValue({ id: 3, code: 'content' });
      mockQueryRunner.manager.find.mockResolvedValue([
        { id: 10, key: 'customers.view', supportsScope: true },
      ]);

      const res = await service.updatePositionOverride(1, 3, {
        permissions: [{ permissionKey: 'customers.view', scope: 'own' as any }],
      });

      expect(res.success).toBe(true);
      expect(mockQueryRunner.manager.delete).toHaveBeenCalledWith(RolePermission, { roleId: 1, positionId: 3 });
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith([
        expect.objectContaining({ roleId: 1, positionId: 3, departmentId: null, permissionId: 10 }),
      ]);
      expect(mockPermissionsService.invalidate).toHaveBeenCalledWith('employee', undefined, 3);
    });

    it('updatePositionOverride -> CHO PHÉP scope="none" (từ chối tường minh) dù permission hỗ trợ scope', async () => {
      mockRoleRepo.findOneBy.mockResolvedValue({ id: 1, code: 'employee' });
      mockPositionRepo.findOneBy.mockResolvedValue({ id: 3, code: 'content' });
      mockQueryRunner.manager.find.mockResolvedValue([
        { id: 10, key: 'customers.edit', supportsScope: true },
      ]);

      const res = await service.updatePositionOverride(1, 3, {
        permissions: [{ permissionKey: 'customers.edit', scope: PermissionScope.NONE }],
      });

      expect(res.success).toBe(true);
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith([
        expect.objectContaining({ roleId: 1, positionId: 3, permissionId: 10, scope: PermissionScope.NONE }),
      ]);
    });

    it('deletePositionOverride -> xoá thành công, invalidate cache cho vị trí đó', async () => {
      mockRoleRepo.findOneBy.mockResolvedValue({ id: 1, code: 'employee' });
      await service.deletePositionOverride(1, 3);
      expect(mockRolePermissionRepo.delete).toHaveBeenCalledWith({ roleId: 1, positionId: 3 });
      expect(mockPermissionsService.invalidate).toHaveBeenCalledWith('employee', undefined, 3);
    });
  });

  describe('getMyPermissions - hỗ trợ positionId', () => {
    it('role không phải admin -> truyền đúng departmentId VÀ positionId xuống PermissionsService', async () => {
      mockPermissionsService.getRolePermissions.mockResolvedValue(new Map([['customers.view', 'own']]));

      const res = await service.getMyPermissions('employee', 5, 3);

      expect(mockPermissionsService.getRolePermissions).toHaveBeenCalledWith('employee', 5, 3);
      expect(res).toEqual({ 'customers.view': 'own' });
    });

    it('role admin -> luôn trả full quyền scope=all, KHÔNG gọi PermissionsService (lối thoát hiểm, bất kể positionId)', async () => {
      mockPermissionRepo.find.mockResolvedValue([{ key: 'customers.view' }, { key: 'positions.manage' }]);

      const res = await service.getMyPermissions('admin', 5, 3);

      expect(mockPermissionsService.getRolePermissions).not.toHaveBeenCalled();
      expect(res).toEqual({ 'customers.view': PermissionScope.ALL, 'positions.manage': PermissionScope.ALL });
    });
  });
});