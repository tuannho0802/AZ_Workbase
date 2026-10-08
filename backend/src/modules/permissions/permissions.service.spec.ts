import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PermissionsService } from './permissions.service';
import { RolePermission, PermissionScope } from '../../database/entities/role-permission.entity';
import { PermissionsVersionService } from './permissions-version.service';

describe('PermissionsService', () => {
  let service: PermissionsService;

  const mockRolePermissionRepo = {
    find: jest.fn(),
  };

  const mockVersionService = { bump: jest.fn(), getEpoch: jest.fn().mockResolvedValue(0) };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useRealTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: getRepositoryToken(RolePermission), useValue: mockRolePermissionRepo },
        { provide: PermissionsVersionService, useValue: mockVersionService },
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

    it('override scope="none" -> phòng ban KHÔNG có quyền dù Toàn cục đang bật (từ chối tường minh)', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([
        { permission: { key: 'customers.edit' }, scope: PermissionScope.OWN, departmentId: null },
        { permission: { key: 'customers.edit' }, scope: PermissionScope.NONE, departmentId: 5 },
      ]);

      const result = await service.hasPermission('employee', 'customers.edit', 5);
      expect(result).toEqual({ allowed: false, scope: null });
    });

    it('override scope="none" chỉ ảnh hưởng đúng phòng ban đó, phòng khác vẫn dùng Toàn cục', async () => {
      // Phòng 5 có dòng "none" cho customers.edit; phòng 6 hoàn toàn không
      // đụng tới (không được trả về trong `rows` vì query WHERE departmentId
      // IN (5, NULL) khi gọi phòng 5) - mô phỏng đúng bằng cách gọi riêng
      // department 6 với chỉ dòng global.
      mockRolePermissionRepo.find.mockResolvedValue([
        { permission: { key: 'customers.edit' }, scope: PermissionScope.OWN, departmentId: null },
      ]);

      const result = await service.hasPermission('employee', 'customers.edit', 6);
      expect(result).toEqual({ allowed: true, scope: PermissionScope.OWN });
    });

    it('cache: gọi 2 lần liên tiếp cùng role và department -> query DB 1 lần', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([
        { permission: { key: 'customers.view' }, scope: PermissionScope.DEPARTMENT, departmentId: null },
      ]);

      await service.hasPermission('manager', 'customers.view', 5);
      await service.hasPermission('manager', 'customers.view', 5);

      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(1);
    });

    it('single-flight: 6 lời gọi ĐỒNG THỜI cùng key (như SidebarBadges) -> chỉ query DB 1 lần', async () => {
      let release!: () => void;
      mockRolePermissionRepo.find.mockImplementation(
        () => new Promise((resolve) => { release = () => resolve([{ permission: { key: 'customers.view' }, scope: PermissionScope.ALL, departmentId: null }]); }),
      );

      const calls = Promise.all(Array.from({ length: 6 }, () => service.hasPermission('employee', 'customers.view', 3, 2)));
      await new Promise((r) => setImmediate(r));
      release();
      const results = await calls;

      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(1);
      expect(results.every((r) => r.allowed && r.scope === PermissionScope.ALL)).toBe(true);
    });

    it('single-flight: lỗi query không bị kẹt - lần gọi sau query lại bình thường', async () => {
      mockRolePermissionRepo.find.mockRejectedValueOnce(new Error('boom'));
      await expect(service.hasPermission('employee', 'customers.view')).rejects.toThrow('boom');
      mockRolePermissionRepo.find.mockResolvedValueOnce([{ permission: { key: 'customers.view' }, scope: PermissionScope.ALL, departmentId: null }]);
      await expect(service.hasPermission('employee', 'customers.view')).resolves.toEqual({ allowed: true, scope: PermissionScope.ALL });
    });

    it('single-flight + invalidate: query đang bay lúc invalidate KHÔNG ghi đè cache (lần sau đọc lại DB)', async () => {
      let release!: () => void;
      mockRolePermissionRepo.find.mockImplementationOnce(
        () => new Promise((resolve) => { release = () => resolve([{ permission: { key: 'old.perm' }, scope: null, departmentId: null }]); }),
      );
      const first = service.hasPermission('manager', 'old.perm');
      await new Promise((r) => setImmediate(r));
      service.invalidate('manager');
      release();
      await first;

      mockRolePermissionRepo.find.mockResolvedValueOnce([{ permission: { key: 'new.perm' }, scope: null, departmentId: null }]);
      await expect(service.hasPermission('manager', 'new.perm')).resolves.toEqual({ allowed: true, scope: null });
      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(2);
    });

    it('cache + epoch (Reset hệ thống): epoch đổi giữa 2 lần gọi -> bỏ cache, query DB lại', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([
        { permission: { key: 'customers.view' }, scope: PermissionScope.DEPARTMENT, departmentId: null },
      ]);
      mockVersionService.getEpoch.mockResolvedValueOnce(3).mockResolvedValueOnce(3).mockResolvedValueOnce(4);

      await service.hasPermission('manager', 'customers.view', 5); // nạp cache @epoch 3
      await service.hasPermission('manager', 'customers.view', 5); // cùng epoch -> hit
      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(1);
      await service.hasPermission('manager', 'customers.view', 5); // epoch 4 -> nạp lại
      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(2);
    });

    it('cache + epoch: không đọc được epoch (undefined) -> KHÔNG làm mất cache (giữ hành vi cũ)', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([
        { permission: { key: 'customers.view' }, scope: PermissionScope.DEPARTMENT, departmentId: null },
      ]);
      mockVersionService.getEpoch.mockResolvedValueOnce(3).mockResolvedValueOnce(undefined);

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

  // ⚠️ Nhóm test MỚI - xác nhận đúng thứ tự ưu tiên 3 tầng tuyến tính
  // Position -> Department -> Global (PLAN mục 2.2/3.3), KHÔNG phải ma trận
  // tổ hợp Phòng ban x Vị trí.
  describe('hasPermission - Position override (tầng ưu tiên CAO NHẤT)', () => {
    it('có positionId nhưng không có override -> fallback về Department, rồi Global', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([
        { permission: { key: 'customers.view' }, scope: PermissionScope.OWN, departmentId: null, positionId: null },
        { permission: { key: 'customers.view' }, scope: PermissionScope.DEPARTMENT, departmentId: 5, positionId: null },
      ]);

      const result = await service.hasPermission('employee', 'customers.view', 5, 3);
      expect(result).toEqual({ allowed: true, scope: PermissionScope.DEPARTMENT });
    });

    it('Position override THẮNG Department override (dù Department đang "all")', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([
        { permission: { key: 'customers.view' }, scope: PermissionScope.OWN, departmentId: null, positionId: null },
        { permission: { key: 'customers.view' }, scope: PermissionScope.ALL, departmentId: 5, positionId: null },
        { permission: { key: 'customers.view' }, scope: PermissionScope.OWN, departmentId: null, positionId: 3 },
      ]);

      const result = await service.hasPermission('employee', 'customers.view', 5, 3);
      expect(result).toEqual({ allowed: true, scope: PermissionScope.OWN });
    });

    it('Position override scope="none" -> Position KHÔNG có quyền dù Department/Global đang bật (từ chối tường minh, ưu tiên cao nhất)', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([
        { permission: { key: 'customers.edit' }, scope: PermissionScope.OWN, departmentId: null, positionId: null },
        { permission: { key: 'customers.edit' }, scope: PermissionScope.ALL, departmentId: 5, positionId: null },
        { permission: { key: 'customers.edit' }, scope: PermissionScope.NONE, departmentId: null, positionId: 3 },
      ]);

      const result = await service.hasPermission('employee', 'customers.edit', 5, 3);
      expect(result).toEqual({ allowed: false, scope: null });
    });

    it('dòng override Position KHÔNG bị lọc theo departmentId của user - user department=7 vẫn được áp Position override', async () => {
      // Đúng nguyên tắc "3 tầng TUYẾN TÍNH, không phải ma trận tổ hợp": dòng
      // override Position có departmentId=NULL, được áp dụng bất kể user
      // đang thuộc phòng ban nào.
      mockRolePermissionRepo.find.mockResolvedValue([
        { permission: { key: 'customers.view' }, scope: PermissionScope.OWN, departmentId: null, positionId: null },
        { permission: { key: 'customers.view' }, scope: PermissionScope.ALL, departmentId: null, positionId: 3 },
      ]);

      const result = await service.hasPermission('employee', 'customers.view', 7, 3);
      expect(result).toEqual({ allowed: true, scope: PermissionScope.ALL });
    });

    it('positionId=null (user không có Position) -> hành vi Y HỆT trước khi có Position (chỉ Global+Department)', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([
        { permission: { key: 'customers.view' }, scope: PermissionScope.OWN, departmentId: null, positionId: null },
        { permission: { key: 'customers.view' }, scope: PermissionScope.DEPARTMENT, departmentId: 5, positionId: null },
      ]);

      const result = await service.hasPermission('employee', 'customers.view', 5, null);
      expect(result).toEqual({ allowed: true, scope: PermissionScope.DEPARTMENT });
    });

    it('cache key tách riêng theo positionId - 2 vị trí khác nhau cùng role+department -> query DB 2 lần', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([]);

      await service.hasPermission('employee', 'customers.view', 5, 3);
      await service.hasPermission('employee', 'customers.view', 5, 4);

      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidate - BUG FIX: dimension positionId không làm sót cache khi chỉ invalidate theo departmentId (và ngược lại)', () => {
    it('invalidate(roleCode, departmentId) xoá ĐÚNG mọi entry của phòng ban đó, KỂ CẢ entry có kèm positionId khác nhau', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([]);

      // user A: role=employee, dept=5, không có Position -> cache 'employee:5:nopos'
      await service.hasPermission('employee', 'customers.view', 5);
      // user B: role=employee, dept=5, Position=3 -> cache 'employee:5:3'
      await service.hasPermission('employee', 'customers.view', 5, 3);
      // user C: role=employee, dept=6 (phòng khác) -> cache 'employee:6:nopos', KHÔNG được xoá
      await service.hasPermission('employee', 'customers.view', 6);
      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(3);

      service.invalidate('employee', 5);

      // Cả A và B đều phải query lại (2 lần), C vẫn lấy từ cache (không query thêm)
      await service.hasPermission('employee', 'customers.view', 5);
      await service.hasPermission('employee', 'customers.view', 5, 3);
      await service.hasPermission('employee', 'customers.view', 6);

      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(5);
    });

    it('invalidate(roleCode, undefined, positionId) xoá ĐÚNG mọi entry của vị trí đó, KỂ CẢ entry có kèm departmentId khác nhau', async () => {
      mockRolePermissionRepo.find.mockResolvedValue([]);

      // user A: dept=5, Position=3 -> cache 'employee:5:3'
      await service.hasPermission('employee', 'customers.view', 5, 3);
      // user B: dept=7 (phòng khác), Position=3 -> cache 'employee:7:3'
      await service.hasPermission('employee', 'customers.view', 7, 3);
      // user C: dept=5, Position=4 (vị trí khác) -> KHÔNG được xoá
      await service.hasPermission('employee', 'customers.view', 5, 4);
      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(3);

      service.invalidate('employee', undefined, 3);

      await service.hasPermission('employee', 'customers.view', 5, 3);
      await service.hasPermission('employee', 'customers.view', 7, 3);
      await service.hasPermission('employee', 'customers.view', 5, 4);

      expect(mockRolePermissionRepo.find).toHaveBeenCalledTimes(5);
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

  describe('invalidate -> bump phiên bản quyền (tín hiệu cho FE)', () => {
    it('mọi lần invalidate (có/không tham số) đều bump', () => {
      service.invalidate();
      service.invalidate('employee', 3);
      service.invalidate('employee', undefined, 5);
      expect(mockVersionService.bump).toHaveBeenCalledTimes(3);
    });
  });
});
