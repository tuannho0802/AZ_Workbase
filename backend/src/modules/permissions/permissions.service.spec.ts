import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PermissionsService } from './permissions.service';
import { RolePermission, PermissionScope } from '../../database/entities/role-permission.entity';

describe('PermissionsService', () => {
  let service: PermissionsService;

  const mockRolePermissionRepo = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useRealTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: getRepositoryToken(RolePermission), useValue: mockRolePermissionRepo },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
  });

  describe('hasPermission', () => {
    it('role có dòng row cho permission -> allowed=true, đúng scope', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([
        { permission: { key: 'customers.view' }, scope: PermissionScope.DEPARTMENT },
      ]);

      const result = await service.hasPermission('manager', 'customers.view');

      expect(result).toEqual({ allowed: true, scope: PermissionScope.DEPARTMENT });
    });

    it('role KHÔNG có dòng row cho permission -> allowed=false (không phải throw)', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([
        { permission: { key: 'customers.view' }, scope: PermissionScope.ALL },
      ]);

      const result = await service.hasPermission('employee', 'roles.manage');

      expect(result).toEqual({ allowed: false, scope: null });
    });

    it('permission nhị phân (không hỗ trợ scope) -> scope null nhưng allowed=true', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([
        { permission: { key: 'roles.manage' }, scope: null },
      ]);

      const result = await service.hasPermission('admin', 'roles.manage');

      expect(result).toEqual({ allowed: true, scope: null });
    });

    it('cache: gọi 2 lần liên tiếp cùng role chỉ query DB 1 lần', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([
        { permission: { key: 'customers.view' }, scope: PermissionScope.ALL },
      ]);

      await service.hasPermission('admin', 'customers.view');
      await service.hasPermission('admin', 'customers.assign');

      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(1);
    });

    it('2 role khác nhau -> query DB riêng cho từng role (cache theo key role)', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([]);

      await service.hasPermission('admin', 'customers.view');
      await service.hasPermission('manager', 'customers.view');

      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidate', () => {
    it('invalidate(roleCode) -> lần gọi tiếp theo cho role đó query lại DB', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([]);

      await service.hasPermission('manager', 'customers.view');
      service.invalidate('manager');
      await service.hasPermission('manager', 'customers.view');

      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(2);
    });

    it('invalidate(roleCode) KHÔNG ảnh hưởng cache của role khác', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([]);

      await service.hasPermission('manager', 'customers.view');
      await service.hasPermission('admin', 'customers.view');
      service.invalidate('manager');
      await service.hasPermission('admin', 'customers.view'); // vẫn cache, không query lại

      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(2);
    });

    it('invalidate() không tham số -> xoá cache TOÀN BỘ mọi role', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([]);

      await service.hasPermission('manager', 'customers.view');
      await service.hasPermission('admin', 'customers.view');
      service.invalidate();
      await service.hasPermission('manager', 'customers.view');
      await service.hasPermission('admin', 'customers.view');

      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(4);
    });
  });

  describe('cache TTL (an toàn đa-instance)', () => {
    it('sau khi TTL hết hạn, lần gọi tiếp theo query lại DB dù không invalidate() thủ công', async () => {
      jest.useFakeTimers();
      mockRolePermissionRepo.find.mockResolvedValue([]);

      await service.hasPermission('manager', 'customers.view');
      jest.advanceTimersByTime(31_000); // > CACHE_TTL_MS (30s)
      await service.hasPermission('manager', 'customers.view');

      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });
  });

  describe('getRolePermissions', () => {
    it('trả về Map đầy đủ permissionKey -> scope', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([
        { permission: { key: 'customers.view' }, scope: PermissionScope.ALL },
        { permission: { key: 'roles.manage' }, scope: null },
      ]);

      const map = await service.getRolePermissions('admin');

      expect(map.get('customers.view')).toBe(PermissionScope.ALL);
      expect(map.get('roles.manage')).toBeNull();
      expect(map.has('customers.assign')).toBe(false);
    });
  });
});
