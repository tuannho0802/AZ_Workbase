import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UiVisibilityService } from './ui-visibility.service';
import { UiVisibilityRule } from '../../database/entities/ui-visibility-rule.entity';
import { RoleEntity } from '../../database/entities/role.entity';
import { Department } from '../../database/entities/department.entity';
import { Position } from '../../database/entities/position.entity';
import { Role } from '../../common/enums/role.enum';

describe('UiVisibilityService', () => {
  let service: UiVisibilityService;

  const mockRuleRepo = {
    find: jest.fn(),
    delete: jest.fn(),
  };
  const mockRoleRepo = {
    findOneBy: jest.fn(),
  };
  const mockDepartmentRepo = {
    findOneBy: jest.fn(),
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
      delete: jest.fn(),
      create: jest.fn((_entity, data) => data),
      save: jest.fn(),
    },
  };
  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UiVisibilityService,
        { provide: getRepositoryToken(UiVisibilityRule), useValue: mockRuleRepo },
        { provide: getRepositoryToken(RoleEntity), useValue: mockRoleRepo },
        { provide: getRepositoryToken(Department), useValue: mockDepartmentRepo },
        { provide: getRepositoryToken(Position), useValue: mockPositionRepo },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<UiVisibilityService>(UiVisibilityService);
  });

  // ══════════════════════════════════════════════════════════════════════
  // getHiddenElementKeys() - default OPT-OUT: bảng trống = mọi thứ HIỆN.
  // ══════════════════════════════════════════════════════════════════════
  describe('getHiddenElementKeys', () => {
    it('trả Set rỗng cho Root Admin (role=admin, isRootAdmin=true) - KHÔNG query DB (bypass cứng, Root Admin không tự khoá mắt chính mình)', async () => {
      const result = await service.getHiddenElementKeys(Role.ADMIN, 'customers', undefined, undefined, true);

      expect(result.size).toBe(0);
      expect(mockRuleRepo.find).not.toHaveBeenCalled();
    });

    // MỚI (isRootAdmin) - Admin THƯỜNG (role=admin nhưng isRootAdmin=false
    // hoặc không truyền) KHÔNG còn được bypass mặc định nữa, phải tra DB
    // như mọi role khác - đúng ý đồ "chỉ Root Admin mới không thể bị ẩn field".
    it('Admin THƯỜNG (isRootAdmin=false) KHÔNG bypass - vẫn query DB như role khác', async () => {
      mockRuleRepo.find.mockResolvedValue([]);

      await service.getHiddenElementKeys(Role.ADMIN, 'customers', undefined, undefined, false);

      expect(mockRuleRepo.find).toHaveBeenCalled();
    });

    it('trả Set rỗng cho resource không hợp lệ - KHÔNG query DB', async () => {
      const result = await service.getHiddenElementKeys('employee', 'not_a_real_resource');

      expect(result.size).toBe(0);
      expect(mockRuleRepo.find).not.toHaveBeenCalled();
    });

    it('bảng trống (không có dòng nào) -> Set rỗng, KHÔNG ẩn field nào (đúng thiết kế opt-out, KHÔNG được đảo thành deny-by-default)', async () => {
      mockRuleRepo.find.mockResolvedValue([]);

      const result = await service.getHiddenElementKeys('employee', 'customers');

      expect(result.size).toBe(0);
    });

    it('merge ĐÚNG THỨ TỰ Global -> Department -> Position (tầng sau đè tầng trước)', async () => {
      mockRuleRepo.find.mockResolvedValue([
        // Global: ẩn cả sales_assignment lẫn marketing_assignment.
        { elementKey: 'field:sales_assignment', visible: false, departmentId: null, positionId: null },
        { elementKey: 'field:marketing_assignment', visible: false, departmentId: null, positionId: null },
        // Department override: MỞ LẠI marketing_assignment.
        { elementKey: 'field:marketing_assignment', visible: true, departmentId: 2, positionId: null },
        // Position override: ẩn thêm closed_date.
        { elementKey: 'field:closed_date', visible: false, departmentId: null, positionId: 5 },
      ]);

      const result = await service.getHiddenElementKeys('employee', 'customers', 2, 5);

      expect(result.has('field:sales_assignment')).toBe(true); // vẫn ẩn (Global, không bị đè)
      expect(result.has('field:marketing_assignment')).toBe(false); // Department mở lại
      expect(result.has('field:closed_date')).toBe(true); // Position ẩn thêm
    });

    it('Position override đè lên Department override nếu cùng element_key', async () => {
      mockRuleRepo.find.mockResolvedValue([
        { elementKey: 'field:closed_date', visible: false, departmentId: 2, positionId: null },
        { elementKey: 'field:closed_date', visible: true, departmentId: null, positionId: 5 },
      ]);

      const result = await service.getHiddenElementKeys('employee', 'customers', 2, 5);

      expect(result.has('field:closed_date')).toBe(false); // Position (mở lại) thắng
    });

    it('dùng cache trong TTL - gọi 2 lần cùng scope chỉ query DB 1 lần', async () => {
      mockRuleRepo.find.mockResolvedValue([]);

      await service.getHiddenElementKeys('employee', 'customers', 2, null);
      await service.getHiddenElementKeys('employee', 'customers', 2, null);

      expect(mockRuleRepo.find).toHaveBeenCalledTimes(1);
    });

    it('invalidate() xoá cache - gọi lại sau invalidate phải query DB lần nữa', async () => {
      mockRuleRepo.find.mockResolvedValue([]);

      await service.getHiddenElementKeys('employee', 'customers');
      service.invalidate('employee');
      await service.getHiddenElementKeys('employee', 'customers');

      expect(mockRuleRepo.find).toHaveBeenCalledTimes(2);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // stripHiddenCustomerFields() - xoá field KHỎI object (không set null).
  // ══════════════════════════════════════════════════════════════════════
  describe('stripHiddenCustomerFields', () => {
    it('không đụng gì tới object nếu hiddenKeys rỗng', () => {
      const customer = { id: 1, name: 'A', salesUserId: 9 };
      const result = service.stripHiddenCustomerFields(customer, new Set());

      expect(result).toEqual(customer);
    });

    it('field:sales_assignment xoá salesUserId, salesUser, activeAssignees', () => {
      const customer: any = {
        id: 1,
        salesUserId: 9,
        salesUser: { id: 9, name: 'Sales A' },
        activeAssignees: [{ id: 2 }],
        marketingUserId: 3,
      };

      service.stripHiddenCustomerFields(customer, new Set(['field:sales_assignment']));

      expect(customer.salesUserId).toBeUndefined();
      expect(customer.salesUser).toBeUndefined();
      expect(customer.activeAssignees).toBeUndefined();
      expect(customer.marketingUserId).toBe(3); // field khác KHÔNG bị đụng
    });

    it('field:marketing_assignment xoá marketingUserId, marketingUser (KHÔNG đụng sales)', () => {
      const customer: any = {
        salesUserId: 9,
        marketingUserId: 3,
        marketingUser: { id: 3, name: 'MKT A' },
      };

      service.stripHiddenCustomerFields(customer, new Set(['field:marketing_assignment']));

      expect(customer.marketingUserId).toBeUndefined();
      expect(customer.marketingUser).toBeUndefined();
      expect(customer.salesUserId).toBe(9);
    });

    it('field:assigned_date và field:closed_date xoá đúng field tương ứng', () => {
      const customer: any = { assignedDate: '2026-01-01', closedDate: '2026-02-01' };

      service.stripHiddenCustomerFields(
        customer,
        new Set(['field:assigned_date', 'field:closed_date']),
      );

      expect(customer.assignedDate).toBeUndefined();
      expect(customer.closedDate).toBeUndefined();
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // upsertRoleRules() - ghi đè TOÀN BỘ 1 scope (validate + transaction).
  // ══════════════════════════════════════════════════════════════════════
  describe('upsertRoleRules', () => {
    it('báo lỗi NotFoundException nếu role không tồn tại', async () => {
      mockRoleRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.upsertRoleRules(999, { resource: 'customers', rules: [] } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('báo lỗi BadRequestException nếu set cả departmentId lẫn positionId cùng lúc', async () => {
      mockRoleRepo.findOneBy.mockResolvedValue({ id: 1, code: 'employee' });

      await expect(
        service.upsertRoleRules(1, {
          resource: 'customers',
          departmentId: 2,
          positionId: 5,
          rules: [],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('báo lỗi NotFoundException nếu departmentId truyền vào không tồn tại', async () => {
      mockRoleRepo.findOneBy.mockResolvedValue({ id: 1, code: 'employee' });
      mockDepartmentRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.upsertRoleRules(1, { resource: 'customers', departmentId: 99, rules: [] } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('báo lỗi BadRequestException nếu element_key không thuộc danh mục hợp lệ của resource', async () => {
      mockRoleRepo.findOneBy.mockResolvedValue({ id: 1, code: 'employee' });

      await expect(
        service.upsertRoleRules(1, {
          resource: 'customers',
          rules: [{ elementKey: 'field:khong_ton_tai', visible: false }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('ghi thành công: xoá rule cũ đúng scope + insert rule mới trong 1 transaction, rồi invalidate cache', async () => {
      mockRoleRepo.findOneBy.mockResolvedValue({ id: 1, code: 'employee' });
      mockQueryRunner.manager.save.mockResolvedValue(undefined);
      const invalidateSpy = jest.spyOn(service, 'invalidate');

      const result = await service.upsertRoleRules(1, {
        resource: 'customers',
        rules: [{ elementKey: 'field:sales_assignment', visible: false }],
      } as any);

      expect(mockQueryRunner.manager.delete).toHaveBeenCalled();
      expect(mockQueryRunner.manager.save).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(invalidateSpy).toHaveBeenCalledWith('employee', undefined, undefined);
      expect(result).toEqual({ success: true, count: 1 });
    });

    it('rollback transaction nếu save() lỗi giữa chừng', async () => {
      mockRoleRepo.findOneBy.mockResolvedValue({ id: 1, code: 'employee' });
      mockQueryRunner.manager.save.mockRejectedValue(new Error('DB lỗi'));

      await expect(
        service.upsertRoleRules(1, {
          resource: 'customers',
          rules: [{ elementKey: 'field:sales_assignment', visible: false }],
        } as any),
      ).rejects.toThrow('DB lỗi');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // deleteRoleRules() - reset 1 scope về mặc định (mọi thứ HIỆN lại).
  // ══════════════════════════════════════════════════════════════════════
  describe('deleteRoleRules', () => {
    it('báo lỗi BadRequestException nếu set cả departmentId lẫn positionId cùng lúc', async () => {
      mockRoleRepo.findOneBy.mockResolvedValue({ id: 1, code: 'employee' });

      await expect(
        service.deleteRoleRules(1, { resource: 'customers', departmentId: 2, positionId: 5 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('xoá đúng scope Global khi không truyền departmentId/positionId', async () => {
      mockRoleRepo.findOneBy.mockResolvedValue({ id: 1, code: 'employee' });

      await service.deleteRoleRules(1, { resource: 'customers' } as any);

      expect(mockRuleRepo.delete).toHaveBeenCalledWith(
        expect.objectContaining({ roleId: 1, resource: 'customers' }),
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // getRoleRules() - gom rule theo Global / Department / Position để FE vẽ 1 lần.
  // ══════════════════════════════════════════════════════════════════════
  describe('getRoleRules', () => {
    it('báo lỗi NotFoundException nếu role không tồn tại', async () => {
      mockRoleRepo.findOneBy.mockResolvedValue(null);

      await expect(service.getRoleRules(999, 'customers')).rejects.toThrow(NotFoundException);
    });

    it('gom đúng 3 nhóm global/departmentOverrides/positionOverrides', async () => {
      mockRoleRepo.findOneBy.mockResolvedValue({ id: 1, code: 'employee' });
      mockRuleRepo.find.mockResolvedValue([
        { elementKey: 'field:sales_assignment', visible: false, departmentId: null, positionId: null },
        {
          elementKey: 'field:closed_date',
          visible: false,
          departmentId: 2,
          positionId: null,
          department: { name: 'Marketing' },
        },
        {
          elementKey: 'field:closed_date',
          visible: true,
          departmentId: null,
          positionId: 5,
          position: { name: 'Content' },
        },
      ]);

      const result = await service.getRoleRules(1, 'customers');

      expect(result.global).toEqual([{ elementKey: 'field:sales_assignment', visible: false }]);
      expect(result.departmentOverrides).toEqual([
        {
          departmentId: 2,
          departmentName: 'Marketing',
          rules: [{ elementKey: 'field:closed_date', visible: false }],
        },
      ]);
      expect(result.positionOverrides).toEqual([
        {
          positionId: 5,
          positionName: 'Content',
          rules: [{ elementKey: 'field:closed_date', visible: true }],
        },
      ]);
    });
  });
});