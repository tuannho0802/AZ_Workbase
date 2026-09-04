import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RoleEntity } from '../../database/entities/role.entity';
import { Permission } from '../../database/entities/permission.entity';
import { RolePermission, PermissionScope } from '../../database/entities/role-permission.entity';
import { User } from '../../database/entities/user.entity';
import { DataSource } from 'typeorm';
import { PermissionsService } from '../permissions/permissions.service';

describe('RolesService', () => {
  let service: RolesService;

  const mockRoleRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const mockPermissionRepo = {
    find: jest.fn(),
  };
  const mockRolePermissionRepo = {
    find: jest.fn(),
    count: jest.fn(),
    exists: jest.fn(),
  };
  const mockUserRepo = {
    count: jest.fn(),
  };
  const mockDataSource = {
    transaction: jest.fn((cb) =>
      cb({
        delete: jest.fn(),
        create: jest.fn((_entity, data) => data),
        save: jest.fn(),
      }),
    ),
  };
  const mockPermissionsService = {
    invalidate: jest.fn(),
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

    it('từ chối xoá role đang có nhân viên được gán', async () => {
      mockRoleRepo.findOne.mockResolvedValue({
        id: 5,
        code: 'mkt_manager',
        isSystem: false,
        name: 'MKT Manager',
      });
      mockUserRepo.count.mockResolvedValue(3);

      await expect(service.deleteRole(5)).rejects.toThrow(ConflictException);
      expect(mockRoleRepo.remove).not.toHaveBeenCalled();
    });

    it('xoá thành công role tuỳ chỉnh không còn ai dùng, và invalidate cache', async () => {
      const role = { id: 5, code: 'mkt_manager', isSystem: false, name: 'MKT Manager' };
      mockRoleRepo.findOne.mockResolvedValue(role);
      mockUserRepo.count.mockResolvedValue(0);

      await service.deleteRole(5);

      expect(mockRoleRepo.remove).toHaveBeenCalledWith(role);
      expect(mockPermissionsService.invalidate).toHaveBeenCalledWith('mkt_manager');
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
});
