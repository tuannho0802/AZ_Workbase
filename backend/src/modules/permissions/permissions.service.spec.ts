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
    it('không truyền departmentId -> dùng quyền global (departmentId = null)', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([
        { permission: { key: 'customers.view' }, scope: PermissionScope.DEPARTMENT, departmentId: null },
      ]);

      const result = await service.hasPermission('manager', 'customers.view');
      expect(result).toEqual({ allowed: true, scope: PermissionScope.DEPARTMENT });
    });

    it('có truyền departmentId nhưng không có override -> fallback về quyền global', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([
        { permission: { key: 'customers.view' }, scope: PermissionScope.DEPARTMENT, departmentId: null },
      ]);

      const result = await service.hasPermission('manager', 'customers.view', 5);
      expect(result).toEqual({ allowed: true, scope: PermissionScope.DEPARTMENT });
    });

    it('có truyền departmentId và có override -> override ghi đè global', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([
        { permission: { key: 'customers.view' }, scope: PermissionScope.DEPARTMENT, departmentId: null },
        { permission: { key: 'customers.view' }, scope: PermissionScope.ALL, departmentId: 5 },
      ]);

      const result = await service.hasPermission('manager', 'customers.view', 5);
      expect(result).toEqual({ allowed: true, scope: PermissionScope.ALL });
    });

    it('cache: gọi 2 lần liên tiếp cùng role và department -> query DB 1 lần', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([
        { permission: { key: 'customers.view' }, scope: PermissionScope.DEPARTMENT, departmentId: null },
      ]);

      await service.hasPermission('manager', 'customers.view', 5);
      await service.hasPermission('manager', 'customers.view', 5);

      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(1);
    });

    it('cache: gọi 2 lần với 2 department khác nhau -> query DB 2 lần', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([]);

      await service.hasPermission('manager', 'customers.view', 5);
      await service.hasPermission('manager', 'customers.view', 6);

      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidate', () => {
    it('invalidate(roleCode, departmentId) -> xoá đúng cache của phòng đó, phòng khác giữ nguyên', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([]);

      await service.hasPermission('manager', 'customers.view', 5);
      await service.hasPermission('manager', 'customers.view', 6);
      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(2);

      service.invalidate('manager', 5);
      
      await service.hasPermission('manager', 'customers.view', 5); // query lai
      await service.hasPermission('manager', 'customers.view', 6); // lay tu cache

      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(3);
    });

    it('invalidate(roleCode) -> xoá tất cả cache của role đó (các phòng đều mất cache)', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([]);

      await service.hasPermission('manager', 'customers.view', 5);
      await service.hasPermission('manager', 'customers.view', 6);
      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(2);

      service.invalidate('manager');
      
      await service.hasPermission('manager', 'customers.view', 5); // query lai
      await service.hasPermission('manager', 'customers.view', 6); // query lai

      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(4);
    });

    it('invalidate() -> xoá toàn bộ cache mọi role', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([]);

      await service.hasPermission('manager', 'customers.view', 5);
      await service.hasPermission('employee', 'customers.view', 5);
      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(2);

      service.invalidate();
      
      await service.hasPermission('manager', 'customers.view', 5); // query lai
      await service.hasPermission('employee', 'customers.view', 5); // query lai

      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(4);
    });
  });
});
