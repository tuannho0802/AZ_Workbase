import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Brackets } from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerNote } from '../../database/entities/customer-note.entity';
import { Deposit } from '../../database/entities/deposit.entity';
import { CustomerAssignment, AssignmentStatus } from '../../database/entities/customer-assignment.entity';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { AuditService } from '../audit/audit.service';
import {
  DuplicatePhoneException,
  UnauthorizedCustomerAccessException,
} from './exceptions/customer.exceptions';
import { Role } from '../../common/enums/role.enum';
import { PermissionScope } from '../../database/entities/role-permission.entity';

describe('CustomersService', () => {
  let service: CustomersService;

  // ⚠️ Trước đây file này CHỈ mock CustomerRepository - nhưng
  // CustomersService đã từ lâu cần thêm CustomerNote/Deposit/
  // CustomerAssignment repo + AuditService trong constructor. Thiếu các mock
  // này khiến NestJS không dựng nổi TestingModule (lỗi resolve dependency),
  // nên TOÀN BỘ 3 test trước đây đều fail ngay ở bước khởi tạo, chưa chạy
  // tới logic nào cả - không liên quan gì đến các method mới thêm.
  const mockCustomerRepo = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
    merge: jest.fn(),
    softDelete: jest.fn(),
    // Dùng trong bulkAssign() để lấy batch customer theo customerIds - khai
    // báo sẵn ở đây (thay vì gán runtime trong describe('bulkAssign') như
    // bản cũ) để type suy luận từ object literal này đã có sẵn `find`, tránh
    // lỗi TS2339 ở các test bên dưới gọi mockCustomerRepo.find.mockResolvedValue().
    find: jest.fn(),
    // customersRepository.manager.getRepository(User) được dùng trong
    // create()/updateAssignment() để validate salesUserId/assignedToId -
    // mock rỗng, gán return value cụ thể trong từng describe() cần dùng.
    manager: { getRepository: jest.fn() },
  };
  const mockNoteRepo = {};
  const mockDepositRepo = {};
  const mockAssignmentRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
  };
  // ⚠️ Provider thứ 5 trong constructor CustomersService (thêm sau khi tính
  // năng "checklist tham gia nhóm liên kết" ra đời) - trước đây file test
  // này thiếu hẳn mock cho nó, khiến NestJS không dựng nổi TestingModule
  // (lỗi "Nest can't resolve dependencies... CustomerGroupMembershipRepository")
  // -> TOÀN BỘ test trong file đều fail ngay ở bước khởi tạo module, không
  // liên quan gì tới logic nghiệp vụ nào. Không method nào trong service
  // đang được test ở đây thực sự gọi tới repo này, nên object rỗng là đủ.
  const mockGroupMembershipRepo = {};
  const mockAuditService = {
    logAction: jest.fn(),
    logActionAsync: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: getRepositoryToken(Customer), useValue: mockCustomerRepo },
        { provide: getRepositoryToken(CustomerNote), useValue: mockNoteRepo },
        { provide: getRepositoryToken(Deposit), useValue: mockDepositRepo },
        {
          provide: getRepositoryToken(CustomerAssignment),
          useValue: mockAssignmentRepo,
        },
        {
          provide: getRepositoryToken(CustomerGroupMembership),
          useValue: mockGroupMembershipRepo,
        },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  it('nên khởi tạo thành công service', () => {
    expect(service).toBeDefined();
  });

  describe('create - Tạo khách hàng', () => {
    it('nên tạo và lưu trữ khách hàng thành công', async () => {
      const dto: any = { name: 'Test Nguyen', phone: '0912345678' };
      // create() không trả nguyên object đưa vào .create() - nó augment
      // thêm nhiều field (createdById, createdBy_OLD, inputDate...) - mock
      // trả về đúng những gì repo thật sẽ trả (entity đã build xong).
      mockCustomerRepo.create.mockImplementation((input: any) => input);
      mockCustomerRepo.save.mockImplementation((entity: any) =>
        Promise.resolve({ id: 1, ...entity }),
      );

      const result = await service.create(dto, 1);

      expect(result).toEqual(expect.objectContaining({ id: 1, name: 'Test Nguyen' }));
      // Trước đây assert field "createdBy" - đã đổi tên thành "createdById"
      // (và service giờ set thêm nhiều field khác) từ lâu, assertion cũ sai
      // hoàn toàn so với implementation hiện tại. Dùng objectContaining để
      // không phải liệt kê hết mọi field phụ (inputDate, assignedDate...)
      // vốn không phải trọng tâm của test này.
      expect(mockCustomerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Nguyen',
          phone: '0912345678',
          createdById: 1,
          createdBy_OLD: 1,
        }),
      );
    });

    it('nên ném lỗi DuplicatePhoneException khi dính rào cản ER_DUP_ENTRY', async () => {
      const dto: any = { name: 'Test', phone: '0912345678' };
      mockCustomerRepo.create.mockImplementation((input: any) => input);
      mockCustomerRepo.save.mockRejectedValue({ code: 'ER_DUP_ENTRY' });

      await expect(service.create(dto, 1)).rejects.toThrow(DuplicatePhoneException);
    });
  });

  // Test cho 2 method MỚI (updateAssignment/reclaimAssignment) - phần CRUD
  // cho "Chia data" vừa được bổ sung.
  describe('reclaimAssignment - Thu hồi lượt gán data', () => {
    // ⚠️ Dùng factory (không phải 1 object const dùng chung) - spread nông
    // (makeAssignment()) KHÔNG tách bản sao sâu cho field lồng bên
    // trong (customer: {...}), nên nếu dùng chung sẽ bị mutation ở test này
    // rò rỉ sang test khác (customer.salesUserId bị đổi ở 1 test sẽ vẫn còn
    // đổi khi test tiếp theo chạy, dù mỗi test tưởng đang có dữ liệu riêng).
    const makeAssignment = (overrides: Partial<any> = {}) => ({
      id: 10,
      customerId: 100,
      assignedById: 2, // Manager User 2 đã tạo assignment này
      assignedToId: 5, // đang gán cho Sales User 5
      status: AssignmentStatus.ACTIVE,
      customer: { id: 100, salesUserId: 5, updatedById: null },
      ...overrides,
    });

    it('ném NotFoundException nếu không tìm thấy assignment', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.reclaimAssignment(999, 1, Role.ADMIN, PermissionScope.ALL),
      ).rejects.toThrow(NotFoundException);
    });

    it('ném BadRequestException nếu assignment không còn ACTIVE', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue(makeAssignment({ status: AssignmentStatus.RECLAIMED }));

      await expect(
        service.reclaimAssignment(10, 1, Role.ADMIN, PermissionScope.ALL),
      ).rejects.toThrow(BadRequestException);
    });

    it('ném UnauthorizedCustomerAccessException nếu người gọi không phải Admin/Manager và không phải người tạo', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue(makeAssignment());

      // caller id=999, role EMPLOYEE, không trùng assignedById=2
      await expect(
        service.reclaimAssignment(10, 999, Role.EMPLOYEE, PermissionScope.OWN),
      ).rejects.toThrow(UnauthorizedCustomerAccessException);
    });

    it('cho phép chính người đã tạo assignment (assignedById) thu hồi dù không phải Admin/Manager', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue(makeAssignment());
      mockAssignmentRepo.save.mockResolvedValue({});
      mockAssignmentRepo.find.mockResolvedValue([]); // không còn assignee active nào khác
      mockCustomerRepo.save.mockResolvedValue({});

      // caller id=2 (đúng assignedById), role EMPLOYEE - vẫn được phép
      const result = await service.reclaimAssignment(10, 2, Role.EMPLOYEE, PermissionScope.OWN);

      expect(result).toEqual({ message: 'Đã thu hồi lượt gán data thành công' });
    });

    it('set customer.salesUserId = NULL khi thu hồi assignee ACTIVE duy nhất', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue(makeAssignment());
      mockAssignmentRepo.save.mockResolvedValue({});
      mockAssignmentRepo.find.mockResolvedValue([]); // không còn ai active khác
      mockCustomerRepo.save.mockResolvedValue({});

      await service.reclaimAssignment(10, 1, Role.ADMIN, PermissionScope.ALL);

      expect(mockCustomerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ salesUserId: null }),
      );
    });

    it('chuyển salesUserId sang assignee active sớm nhất còn lại nếu còn người khác', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue(makeAssignment());
      mockAssignmentRepo.save.mockResolvedValue({});
      mockAssignmentRepo.find.mockResolvedValue([
        { assignedToId: 7, assignedAt: new Date('2026-01-01') },
      ]);
      mockCustomerRepo.save.mockResolvedValue({});

      await service.reclaimAssignment(10, 1, Role.ADMIN, PermissionScope.ALL);

      expect(mockCustomerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ salesUserId: 7 }),
      );
    });

    it('KHÔNG đụng vào customer.salesUserId nếu người bị thu hồi không phải chủ sở hữu chính', async () => {
      // chủ sở hữu chính là người KHÁC với người bị thu hồi (999 !== 5)
      mockAssignmentRepo.findOne.mockResolvedValue(
        makeAssignment({ customer: { id: 100, salesUserId: 999 } }),
      );
      mockAssignmentRepo.save.mockResolvedValue({});

      await service.reclaimAssignment(10, 1, Role.ADMIN, PermissionScope.ALL);

      expect(mockCustomerRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('updateAssignment - Sửa lượt gán data', () => {
    const baseAssignment: any = {
      id: 10,
      customerId: 100,
      assignedById: 2,
      assignedToId: 5,
      status: AssignmentStatus.ACTIVE,
      reason: 'Lý do cũ',
      customer: { id: 100, salesUserId: 5, updatedById: null },
    };
    const mockUserRepo = { findOneBy: jest.fn() };

    beforeEach(() => {
      mockCustomerRepo.manager.getRepository.mockReturnValue(mockUserRepo);
    });

    it('ném NotFoundException nếu không tìm thấy assignment', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateAssignment(999, { reason: 'x' }, 1, Role.ADMIN, PermissionScope.ALL),
      ).rejects.toThrow(NotFoundException);
    });

    it('ném BadRequestException nếu assignment không còn ACTIVE', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue({
        ...baseAssignment,
        status: AssignmentStatus.RECLAIMED,
      });

      await expect(
        service.updateAssignment(10, { reason: 'x' }, 1, Role.ADMIN, PermissionScope.ALL),
      ).rejects.toThrow(BadRequestException);
    });

    it('ném UnauthorizedCustomerAccessException nếu người gọi không có quyền', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue({ ...baseAssignment });

      await expect(
        service.updateAssignment(10, { reason: 'x' }, 999, Role.EMPLOYEE, PermissionScope.OWN),
      ).rejects.toThrow(UnauthorizedCustomerAccessException);
    });

    it('chỉ sửa reason - không đụng gì tới assignedToId/customer', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue({ ...baseAssignment });
      mockAssignmentRepo.save.mockImplementation((a: any) => Promise.resolve(a));

      const result = await service.updateAssignment(
        10,
        { reason: 'Lý do mới' },
        1,
        Role.ADMIN, PermissionScope.ALL,
      );

      expect(result.reason).toBe('Lý do mới');
      expect(result.assignedToId).toBe(5); // không đổi
      expect(mockCustomerRepo.save).not.toHaveBeenCalled();
    });

    it('ném BadRequestException nếu đổi sang user không tồn tại/đã khoá', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue({ ...baseAssignment });
      mockUserRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.updateAssignment(10, { assignedToId: 999 }, 1, Role.ADMIN, PermissionScope.ALL),
      ).rejects.toThrow(BadRequestException);
    });

    it('ném BadRequestException nếu user mới đã có 1 assignment active khác cho cùng khách hàng', async () => {
      mockUserRepo.findOneBy.mockResolvedValue({ id: 7, isActive: true });
      // lần gọi findOne đầu: lấy assignment đang sửa; lần 2: check trùng -
      // trả về 1 bản ghi -> coi là đã trùng
      mockAssignmentRepo.findOne
        .mockResolvedValueOnce({ ...baseAssignment })
        .mockResolvedValueOnce({ id: 20 });

      await expect(
        service.updateAssignment(10, { assignedToId: 7 }, 1, Role.ADMIN, PermissionScope.ALL),
      ).rejects.toThrow(BadRequestException);
    });

    it('đổi assignedToId thành công + cập nhật customer.salesUserId nếu assignment đang là chủ sở hữu chính', async () => {
      mockAssignmentRepo.findOne
        .mockResolvedValueOnce({ ...baseAssignment }) // lấy assignment đang sửa
        .mockResolvedValueOnce(null); // check trùng -> không trùng
      mockUserRepo.findOneBy.mockResolvedValue({ id: 7, isActive: true, name: 'Sales 7' });
      mockAssignmentRepo.save.mockImplementation((a: any) => Promise.resolve(a));
      mockCustomerRepo.save.mockResolvedValue({});

      const result = await service.updateAssignment(10, { assignedToId: 7 }, 1, Role.ADMIN, PermissionScope.ALL);

      expect(result.assignedToId).toBe(7);
      expect(result.previousAssigneeId).toBe(5); // lưu lại người cũ
      expect(mockCustomerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ salesUserId: 7 }),
      );
    });

    // ⚠️ TRƯỚC ĐÂY hoàn toàn KHÔNG có test nào cho nhánh MANAGER của
    // canModifyAssignment() (private, chỉ test gián tiếp qua updateAssignment/
    // reclaimAssignment) - đây chính xác là nhánh vừa được sửa (Manager giờ
    // phải đúng phòng ban, trước đây bypass hoàn toàn). Thêm 2 case dưới để
    // khoá lại hành vi mới, tránh regression về bypass-toàn-bộ như cũ.
    describe('canModifyAssignment - nhánh MANAGER (qua updateAssignment)', () => {
      const mockDepartmentRepo = { exists: jest.fn() };

      beforeEach(() => {
        // customersRepository.manager.getRepository() được gọi 2 lần khác
        // mục đích trong luồng này: lần 1 lấy User repo (validate
        // assignedToId nếu có), lần 2 lấy Department repo (check quyền
        // Manager) - trả đúng mock tương ứng theo entity được yêu cầu.
        mockCustomerRepo.manager.getRepository.mockImplementation((entity: any) => {
          if (entity?.name === 'Department') return mockDepartmentRepo;
          return mockUserRepo;
        });
      });

      it('MANAGER được sửa nếu khách hàng thuộc phòng ban mình quản lý', async () => {
        mockAssignmentRepo.findOne.mockResolvedValue({ ...baseAssignment, customer: { id: 100, departmentId: 5, salesUserId: 5 } });
        mockDepartmentRepo.exists.mockResolvedValue(true);
        mockAssignmentRepo.save.mockImplementation((a: any) => Promise.resolve(a));

        const result = await service.updateAssignment(10, { reason: 'ok' }, 3, Role.MANAGER, PermissionScope.DEPARTMENT);

        expect(mockDepartmentRepo.exists).toHaveBeenCalledWith({
          where: { id: 5, managerUserId: 3 },
        });
        expect(result.reason).toBe('ok');
      });

      it('MANAGER bị từ chối nếu khách hàng KHÔNG thuộc phòng ban mình quản lý', async () => {
        mockAssignmentRepo.findOne.mockResolvedValue({ ...baseAssignment, customer: { id: 100, departmentId: 99, salesUserId: 5 } });
        mockDepartmentRepo.exists.mockResolvedValue(false);

        await expect(
          service.updateAssignment(10, { reason: 'x' }, 3, Role.MANAGER, PermissionScope.DEPARTMENT),
        ).rejects.toThrow(UnauthorizedCustomerAccessException);
      });

      it('MANAGER bị từ chối nếu khách hàng chưa có departmentId (null)', async () => {
        mockAssignmentRepo.findOne.mockResolvedValue({ ...baseAssignment, customer: { id: 100, departmentId: null, salesUserId: 5 } });

        await expect(
          service.updateAssignment(10, { reason: 'x' }, 3, Role.MANAGER, PermissionScope.DEPARTMENT),
        ).rejects.toThrow(UnauthorizedCustomerAccessException);
        // Không cần query Department nếu đã biết chắc fail từ departmentId null
        expect(mockDepartmentRepo.exists).not.toHaveBeenCalled();
      });
    });
  });

  // ⚠️ TRƯỚC ĐÂY getAssigned() hoàn toàn KHÔNG có test nào - đây CHÍNH LÀ
  // endpoint có bug gốc (Employee thấy data assign của người khác) đã được
  // sửa bằng cách thêm CustomerAccessHelper.applyViewFilter(). Test dưới
  // khoá lại đúng hành vi đó bằng cách đếm số lần .andWhere() bị gọi thêm
  // (ngoài 2 lần base: deletedAt IS NULL qua .where(), salesUserId IS NOT
  // NULL qua .andWhere() đầu tiên) cho từng role.
  describe('getAssigned - Danh sách khách hàng đã assign (tab "Đã assign")', () => {
    function makeFakeQb() {
      const andWhereCalls: any[] = [];
      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn((sql: any, params?: any) => {
          andWhereCalls.push({ sql, params });
          return qb;
        }),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      return { qb, andWhereCalls };
    }

    it('ADMIN: KHÔNG bị áp thêm điều kiện lọc quyền nào (chỉ có andWhere gốc "salesUserId IS NOT NULL")', async () => {
      const { qb, andWhereCalls } = makeFakeQb();
      mockCustomerRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getAssigned({ page: 1, limit: 20, userId: 1, userRole: Role.ADMIN });

      expect(andWhereCalls).toHaveLength(1);
      expect(andWhereCalls[0].sql).toContain('salesUserId IS NOT NULL');
    });

    it('MANAGER: bị áp thêm đúng 1 điều kiện lọc theo phòng ban mình quản lý', async () => {
      const { qb, andWhereCalls } = makeFakeQb();
      mockCustomerRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getAssigned({ page: 1, limit: 20, userId: 9, userRole: Role.MANAGER });

      expect(andWhereCalls).toHaveLength(2);
      expect(andWhereCalls[1].sql).toContain('manager_user_id = :accessManagerId');
      expect(andWhereCalls[1].params).toEqual({ accessManagerId: 9 });
    });

    it('EMPLOYEE: bị áp thêm đúng 1 điều kiện lọc (Brackets createdById/salesUserId/assignment active) - ĐÂY LÀ FIX CHO BUG GỐC', async () => {
      const { qb, andWhereCalls } = makeFakeQb();
      mockCustomerRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getAssigned({ page: 1, limit: 20, userId: 7, userRole: Role.EMPLOYEE });

      // Trước khi fix: andWhereCalls chỉ có 1 phần tử (không có dòng này) ->
      // Employee thấy TOÀN BỘ khách hàng đã assign của mọi người. Giờ phải
      // có thêm đúng 1 điều kiện Brackets giới hạn phạm vi.
      expect(andWhereCalls).toHaveLength(2);
      expect(andWhereCalls[1].sql).toBeInstanceOf(Object); // Brackets instance
    });

    it('vẫn áp thêm filter salesUserId/sourceUserId (query param) SAU filter phân quyền', async () => {
      const { qb, andWhereCalls } = makeFakeQb();
      mockCustomerRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getAssigned({
        page: 1, limit: 20, userId: 1, userRole: Role.ADMIN, salesUserId: 5,
      });

      expect(andWhereCalls).toHaveLength(2);
      expect(andWhereCalls[1].sql).toContain('customer.salesUserId = :salesUserId');
      expect(andWhereCalls[1].params).toEqual({ salesUserId: 5 });
    });
  });

  describe('getUnassigned - Danh sách khách hàng chưa assign', () => {
    function makeFakeQb() {
      const andWhereCalls: any[] = [];
      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn((sql: any, params?: any) => {
          andWhereCalls.push({ sql, params });
          return qb;
        }),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      return { qb, andWhereCalls };
    }

    it('ADMIN/ASSISTANT: chỉ có đúng 1 điều kiện base (chưa Primary HOẶC đang là Primary) - không giới hạn thêm', async () => {
      const { qb, andWhereCalls } = makeFakeQb();
      mockCustomerRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getUnassigned({} as any, 1, Role.ASSISTANT);

      expect(andWhereCalls).toHaveLength(1);
    });

    it('MANAGER: có thêm điều kiện giới hạn theo phòng ban mình quản lý (OR đang là Primary)', async () => {
      const { qb, andWhereCalls } = makeFakeQb();
      mockCustomerRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getUnassigned({} as any, 9, Role.MANAGER);

      expect(andWhereCalls).toHaveLength(2);
      expect(andWhereCalls[1].sql).toBeInstanceOf(Brackets);
      // .andWhere() ở đây được gọi VỚI 1 tham số duy nhất (Brackets) - không
      // có params rời như dạng string SQL thường - nên phải mở whereFactory
      // ra để xem đúng nội dung điều kiện bên trong thay vì so sánh sql/params
      // dạng chuỗi phẳng.
      const innerCalls: string[] = [];
      const innerQb: any = {
        where: (sql: string) => { innerCalls.push(sql); return innerQb; },
        orWhere: (sql: string) => { innerCalls.push(sql); return innerQb; },
      };
      (andWhereCalls[1].sql as Brackets).whereFactory(innerQb);
      expect(innerCalls.join(' ')).toContain('manager_user_id = :userId');
    });

    it('EMPLOYEE: có thêm điều kiện giới hạn theo chính mình tạo ra (OR đang là Primary)', async () => {
      const { qb, andWhereCalls } = makeFakeQb();
      mockCustomerRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getUnassigned({} as any, 7, Role.EMPLOYEE);

      expect(andWhereCalls).toHaveLength(2);
      expect(andWhereCalls[1].sql).toBeInstanceOf(Brackets);
      const innerCalls: string[] = [];
      const innerQb: any = {
        where: (sql: string) => { innerCalls.push(sql); return innerQb; },
        orWhere: (sql: string) => { innerCalls.push(sql); return innerQb; },
      };
      (andWhereCalls[1].sql as Brackets).whereFactory(innerQb);
      expect(innerCalls.join(' ')).toContain('createdById = :userId');
    });
  });

  describe('bulkAssign - Chia data hàng loạt', () => {
    const mockUserRepoForBulk = { find: jest.fn() };
    const mockDepartmentRepoForBulk = { find: jest.fn() };

    beforeEach(() => {
      mockCustomerRepo.manager.getRepository.mockImplementation((entity: any) => {
        if (entity?.name === 'Department') return mockDepartmentRepoForBulk;
        return mockUserRepoForBulk;
      });
      mockUserRepoForBulk.find.mockResolvedValue([{ id: 5, isActive: true }]);
      mockAssignmentRepo.find.mockResolvedValue([]); // không có assignment active trùng sẵn
      (mockAssignmentRepo as any).insert = jest.fn().mockResolvedValue({});
      mockCustomerRepo.createQueryBuilder.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        whereInIds: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      });
    });

    it('MANAGER: được gán khách hàng thuộc phòng ban mình quản lý', async () => {
      mockDepartmentRepoForBulk.find.mockResolvedValue([{ id: 5 }]); // Manager quản lý phòng ban id=5
      mockCustomerRepo.find.mockResolvedValue([
        { id: 100, departmentId: 5, salesUserId: null, createdById: 1 },
      ]);

      const result = await service.bulkAssign([100], [5], 9, Role.MANAGER);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('MANAGER: KHÔNG được gán khách hàng ngoài phòng ban mình quản lý (fix chính - trước đây bypass hoàn toàn)', async () => {
      mockDepartmentRepoForBulk.find.mockResolvedValue([{ id: 5 }]); // chỉ quản lý phòng ban 5
      mockCustomerRepo.find.mockResolvedValue([
        { id: 100, departmentId: 99, salesUserId: null, createdById: 1 }, // thuộc phòng ban 99
      ]);

      const result = await service.bulkAssign([100], [5], 9, Role.MANAGER);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain('không có quyền');
    });

    it('EMPLOYEE: được gán khách hàng CHƯA có ai VÀ chính họ tạo ra (isUnassignedCreator)', async () => {
      mockCustomerRepo.find.mockResolvedValue([
        { id: 100, departmentId: null, salesUserId: null, createdById: 7 },
      ]);

      const result = await service.bulkAssign([100], [5], 7, Role.EMPLOYEE);

      expect(result.success).toBe(1);
    });

    it('EMPLOYEE: được re-delegate khách hàng mà chính họ đang là sales chính (isPrimarySales)', async () => {
      mockCustomerRepo.find.mockResolvedValue([
        { id: 100, departmentId: null, salesUserId: 7, createdById: 1 },
      ]);

      const result = await service.bulkAssign([100], [5], 7, Role.EMPLOYEE);

      expect(result.success).toBe(1);
    });

    it('EMPLOYEE: KHÔNG được "giật" khách hàng đã thuộc về người khác chỉ vì là người tạo ban đầu', async () => {
      mockCustomerRepo.find.mockResolvedValue([
        { id: 100, departmentId: null, salesUserId: 99, createdById: 7 }, // đã có sales khác (99)
      ]);

      const result = await service.bulkAssign([100], [5], 7, Role.EMPLOYEE);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('ADMIN/ASSISTANT: luôn được gán bất kể phòng ban/người tạo', async () => {
      mockCustomerRepo.find.mockResolvedValue([
        { id: 100, departmentId: 123, salesUserId: 456, createdById: 789 },
      ]);

      const result = await service.bulkAssign([100], [5], 1, Role.ASSISTANT);

      expect(result.success).toBe(1);
    });
  });
});