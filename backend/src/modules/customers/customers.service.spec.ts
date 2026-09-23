import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Brackets } from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { PermissionsService } from '../permissions/permissions.service';
import { UiVisibilityService } from '../ui-visibility/ui-visibility.service';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerNote } from '../../database/entities/customer-note.entity';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import { Deposit } from '../../database/entities/deposit.entity';
import { CustomerAssignment, AssignmentStatus } from '../../database/entities/customer-assignment.entity';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  DuplicatePhoneException,
  UnauthorizedCustomerAccessException,
  CustomerNotFoundException,
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
    // Dùng trong remove()/restore() để ghi/xoá `deletedById` (cột "Người
    // xóa" trang Thùng rác) - `softDelete()`/`restore()` của TypeORM không
    // nhận field tuỳ ý nào khác ngoài deletedAt.
    update: jest.fn(),
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
  const mockNoteRepo: {
    findOne?: jest.Mock;
    merge?: jest.Mock;
    save?: jest.Mock;
  } = {};
  const mockDepositRepo: { createQueryBuilder?: jest.Mock } = {};
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
  // liên quan gì tới logic nghiệp vụ nào.
  // ⚠️ CẬP NHẬT (thêm filter/cột "Đã tham gia nhóm" cho report - xem
  // `attachJoinedGroups()`): comment cũ ở trên KHÔNG CÒN ĐÚNG - giờ
  // `getInvalidDataReport()`/`getDuplicateContactReport()` (đang test ở file
  // này) ĐỀU gọi `createQueryBuilder()` trên repo này khi data trả về không
  // rỗng. Cho default trả về mảng rỗng (không có nhóm nào) để các test cũ
  // không cố ý kiểm tra field `joinedGroups` vẫn chạy được bình thường - test
  // nào cần kiểm tra riêng field này có thể tự override bằng
  // `mockGroupMembershipRepo.createQueryBuilder.mockReturnValueOnce(...)`.
  const mockGroupMembershipRepo = {
    createQueryBuilder: jest.fn().mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    }),
  };
  // ⚠️ Provider thứ 6 (Setup dynamic Customer Status -
  // CreateCustomerStatuses1781400000000) - dùng trong
  // `assertValidStatus()` gọi từ create()/update() để đối chiếu
  // `dto.status` với bảng `customer_statuses`. Mặc định `findOne` trả về 1
  // record giả (bất kỳ status nào trong DTO test cũ như 'closed'/'pending'
  // đều coi là hợp lệ) để KHÔNG làm fail các test cũ viết TRƯỚC tính năng
  // này - test nào cần assert case "status không tồn tại" tự override bằng
  // mockResolvedValueOnce(null).
  const mockCustomerStatusRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 1, code: 'pending', name: 'Chờ xử lý' }),
  };
  const mockAuditService = {
    logAction: jest.fn(),
    logActionAsync: jest.fn(),
    // Dùng ở getTrash() để fallback "Người xóa" cho dữ liệu cũ (trước khi
    // có cột deleted_by_id) - mặc định trả rỗng (không tìm thấy gì), test
    // nào cần fallback tự override bằng mockResolvedValueOnce.
    findLastActorsForEntities: jest.fn().mockResolvedValue(new Map()),
  };
  // ⚠️ Provider thứ 7 (thêm khi triển khai sửa/xoá ghi chú - updateNote()/
  // deleteNote() cần tra `customer_notes.edit`/`.delete` cho case sửa/xoá
  // ghi chú CỦA NGƯỜI KHÁC). Mặc định trả `allowed: false` (an toàn hơn) -
  // test nào cần bypass tự override bằng mockResolvedValueOnce/mockReturnValue.
  const mockPermissionsService = {
    hasPermission: jest.fn().mockResolvedValue({ allowed: false, scope: null }),
  };
  // ⚠️ Provider thứ 8 (UI Visibility Phase 3) - trục ĐỘC LẬP với
  // PermissionsService, chỉ strip field khi `getHiddenElementKeys()` trả về
  // tập KHÔNG rỗng. Mặc định trả Set rỗng (không ẩn gì) để các test cũ
  // (viết TRƯỚC khi có UI Visibility) không bị strip field ngoài ý muốn -
  // test nào cần assert hành vi ẩn field tự override bằng mockResolvedValueOnce.
  const mockUiVisibilityService = {
    getHiddenElementKeys: jest.fn().mockResolvedValue(new Set<string>()),
    stripHiddenCustomerFields: jest.fn((customer: any) => customer),
  };

  // ⚠️ Provider thứ 9 (Notification Phase 3) - mặc định TẮT flag (`isEnabled`
  // = false) → toàn bộ test cũ chạy đúng như trước (không có query/emit thêm).
  // Test cần kiểm thông báo tự bật ở describe 'Thông báo tự động (Phase 3)'.
  const mockNotificationsService = {
    isEnabled: jest.fn().mockReturnValue(false),
    emit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockNotificationsService.isEnabled.mockReturnValue(false);
    // mockReset (không chỉ clear): test 'emit ném lỗi' đặt mockImplementation - không được rò sang test khác.
    mockNotificationsService.emit.mockReset();
    mockPermissionsService.hasPermission.mockResolvedValue({ allowed: false, scope: null });
    mockUiVisibilityService.getHiddenElementKeys.mockResolvedValue(new Set<string>());
    mockUiVisibilityService.stripHiddenCustomerFields.mockImplementation((customer: any) => customer);
    mockCustomerStatusRepo.findOne.mockResolvedValue({ id: 1, code: 'pending', name: 'Chờ xử lý' });

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
        { provide: getRepositoryToken(CustomerStatus), useValue: mockCustomerStatusRepo },
        { provide: AuditService, useValue: mockAuditService },
        { provide: PermissionsService, useValue: mockPermissionsService },
        { provide: UiVisibilityService, useValue: mockUiVisibilityService },
        { provide: NotificationsService, useValue: mockNotificationsService },
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
      // ⚠️ Đã chuyển từ cột đơn departments.manager_user_id sang bảng
      // nhiều-nhiều department_managers (xem department-manager.helper.ts) -
      // canModifyAssignment() giờ gọi DepartmentManagerHelper.isManagerOfDepartment()
      // dùng repo.findOne({ where: { departmentId, userId } }), KHÔNG còn
      // Department.exists({ where: { id, managerUserId } }).
      const mockDepartmentManagerRepo = { findOne: jest.fn() };

      beforeEach(() => {
        // customersRepository.manager.getRepository() được gọi 2 lần khác
        // mục đích trong luồng này: lần 1 lấy User repo (validate
        // assignedToId nếu có), lần 2 lấy DepartmentManager repo (check
        // quyền Manager) - trả đúng mock tương ứng theo entity được yêu cầu.
        mockCustomerRepo.manager.getRepository.mockImplementation((entity: any) => {
          if (entity?.name === 'DepartmentManager') return mockDepartmentManagerRepo;
          return mockUserRepo;
        });
      });

      it('MANAGER được sửa nếu khách hàng thuộc phòng ban mình quản lý', async () => {
        mockAssignmentRepo.findOne.mockResolvedValue({ ...baseAssignment, customer: { id: 100, departmentId: 5, salesUserId: 5 } });
        mockDepartmentManagerRepo.findOne.mockResolvedValue({ departmentId: 5, userId: 3 });
        mockAssignmentRepo.save.mockImplementation((a: any) => Promise.resolve(a));

        const result = await service.updateAssignment(10, { reason: 'ok' }, 3, Role.MANAGER, PermissionScope.DEPARTMENT);

        expect(mockDepartmentManagerRepo.findOne).toHaveBeenCalledWith({
          where: { departmentId: 5, userId: 3 },
        });
        expect(result.reason).toBe('ok');
      });

      it('MANAGER bị từ chối nếu khách hàng KHÔNG thuộc phòng ban mình quản lý', async () => {
        mockAssignmentRepo.findOne.mockResolvedValue({ ...baseAssignment, customer: { id: 100, departmentId: 99, salesUserId: 5 } });
        mockDepartmentManagerRepo.findOne.mockResolvedValue(null);

        await expect(
          service.updateAssignment(10, { reason: 'x' }, 3, Role.MANAGER, PermissionScope.DEPARTMENT),
        ).rejects.toThrow(UnauthorizedCustomerAccessException);
      });

      it('MANAGER bị từ chối nếu khách hàng chưa có departmentId (null)', async () => {
        mockAssignmentRepo.findOne.mockResolvedValue({ ...baseAssignment, customer: { id: 100, departmentId: null, salesUserId: 5 } });

        await expect(
          service.updateAssignment(10, { reason: 'x' }, 3, Role.MANAGER, PermissionScope.DEPARTMENT),
        ).rejects.toThrow(UnauthorizedCustomerAccessException);
        // Không cần query DepartmentManager nếu đã biết chắc fail từ departmentId null
        expect(mockDepartmentManagerRepo.findOne).not.toHaveBeenCalled();
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

    it('MANAGER: bị áp thêm đúng 1 điều kiện lọc theo phòng ban mình quản lý (bảng department_managers, nhiều-nhiều) - department vẫn là superset của own nên gói trong Brackets (xem fix bug scope=department)', async () => {
      const { qb, andWhereCalls } = makeFakeQb();
      mockCustomerRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getAssigned({
        page: 1, limit: 20, userId: 9, userRole: Role.MANAGER, scope: PermissionScope.DEPARTMENT,
      });

      expect(andWhereCalls).toHaveLength(2);
      expect(andWhereCalls[1].sql).toBeInstanceOf(Brackets);
      const innerCalls: string[] = [];
      const innerQb: any = {
        where: (sql: string) => { innerCalls.push(sql); return innerQb; },
        orWhere: (sql: string) => { innerCalls.push(sql); return innerQb; },
      };
      (andWhereCalls[1].sql as Brackets).whereFactory(innerQb);
      expect(innerCalls.join(' ')).toContain(
        'SELECT dm.department_id FROM department_managers dm WHERE dm.user_id = :accessManagerId',
      );
      // Vế "own" (createdById của chính mình) vẫn phải còn trong Brackets -
      // đúng nội dung fix bug (department = superset của own).
      expect(innerCalls.join(' ')).toContain('createdById = :accessUserId');
    });

    it('EMPLOYEE: bị áp thêm đúng 1 điều kiện lọc (Brackets createdById/salesUserId/assignment active) - ĐÂY LÀ FIX CHO BUG GỐC', async () => {
      const { qb, andWhereCalls } = makeFakeQb();
      mockCustomerRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getAssigned({
        page: 1, limit: 20, userId: 7, userRole: Role.EMPLOYEE, scope: PermissionScope.OWN,
      });

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
        page: 1, limit: 20, userId: 1, userRole: Role.ADMIN, scope: PermissionScope.ALL, salesUserId: 5,
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

      await service.getUnassigned({} as any, 1, Role.ASSISTANT, PermissionScope.ALL);

      expect(andWhereCalls).toHaveLength(1);
    });

    it('MANAGER: có thêm điều kiện giới hạn theo phòng ban mình quản lý (bảng department_managers, OR đang là Primary)', async () => {
      const { qb, andWhereCalls } = makeFakeQb();
      mockCustomerRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getUnassigned({} as any, 9, Role.MANAGER, PermissionScope.DEPARTMENT);

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
      expect(innerCalls.join(' ')).toContain(
        'SELECT dm.department_id FROM department_managers dm WHERE dm.user_id = :userId',
      );
    });

    it('EMPLOYEE: có thêm điều kiện giới hạn theo chính mình tạo ra (OR đang là Primary)', async () => {
      const { qb, andWhereCalls } = makeFakeQb();
      mockCustomerRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getUnassigned({} as any, 7, Role.EMPLOYEE, PermissionScope.OWN);

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
    // ⚠️ Đã chuyển từ cột đơn departments.manager_user_id sang bảng
    // nhiều-nhiều department_managers - bulkAssign() giờ gọi
    // DepartmentManagerHelper.getManagedDepartmentIds() dùng
    // repo.find({ where: { userId }, select: ['departmentId'] }), trả về
    // mảng dòng { departmentId } (KHÔNG phải { id } của bảng departments).
    const mockDepartmentManagerRepoForBulk = { find: jest.fn() };

    beforeEach(() => {
      mockCustomerRepo.manager.getRepository.mockImplementation((entity: any) => {
        if (entity?.name === 'DepartmentManager') return mockDepartmentManagerRepoForBulk;
        return mockUserRepoForBulk;
      });
      mockUserRepoForBulk.find.mockResolvedValue([{ id: 5, isActive: true }]);
      mockDepartmentManagerRepoForBulk.find.mockResolvedValue([]);
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
      mockDepartmentManagerRepoForBulk.find.mockResolvedValue([{ departmentId: 5 }]); // Manager quản lý phòng ban id=5
      mockCustomerRepo.find.mockResolvedValue([
        { id: 100, departmentId: 5, salesUserId: null, createdById: 1 },
      ]);

      const result = await service.bulkAssign([100], [5], 9, Role.MANAGER, undefined, PermissionScope.DEPARTMENT);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('MANAGER: KHÔNG được gán khách hàng ngoài phòng ban mình quản lý (fix chính - trước đây bypass hoàn toàn)', async () => {
      mockDepartmentManagerRepoForBulk.find.mockResolvedValue([{ departmentId: 5 }]); // chỉ quản lý phòng ban 5
      mockCustomerRepo.find.mockResolvedValue([
        { id: 100, departmentId: 99, salesUserId: null, createdById: 1 }, // thuộc phòng ban 99
      ]);

      const result = await service.bulkAssign([100], [5], 9, Role.MANAGER, undefined, PermissionScope.DEPARTMENT);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain('không có quyền');
    });

    it('EMPLOYEE: được gán khách hàng CHƯA có ai VÀ chính họ tạo ra (isUnassignedCreator)', async () => {
      mockCustomerRepo.find.mockResolvedValue([
        { id: 100, departmentId: null, salesUserId: null, createdById: 7 },
      ]);

      const result = await service.bulkAssign([100], [5], 7, Role.EMPLOYEE, undefined, PermissionScope.OWN);

      expect(result.success).toBe(1);
    });

    it('EMPLOYEE: được re-delegate khách hàng mà chính họ đang là sales chính (isPrimarySales)', async () => {
      mockCustomerRepo.find.mockResolvedValue([
        { id: 100, departmentId: null, salesUserId: 7, createdById: 1 },
      ]);

      const result = await service.bulkAssign([100], [5], 7, Role.EMPLOYEE, undefined, PermissionScope.OWN);

      expect(result.success).toBe(1);
    });

    it('EMPLOYEE: KHÔNG được "giật" khách hàng đã thuộc về người khác chỉ vì là người tạo ban đầu', async () => {
      mockCustomerRepo.find.mockResolvedValue([
        { id: 100, departmentId: null, salesUserId: 99, createdById: 7 }, // đã có sales khác (99)
      ]);

      const result = await service.bulkAssign([100], [5], 7, Role.EMPLOYEE, undefined, PermissionScope.OWN);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('ADMIN/ASSISTANT: luôn được gán bất kể phòng ban/người tạo', async () => {
      mockCustomerRepo.find.mockResolvedValue([
        { id: 100, departmentId: 123, salesUserId: 456, createdById: 789 },
      ]);

      const result = await service.bulkAssign([100], [5], 1, Role.ASSISTANT, undefined, PermissionScope.ALL);

      expect(result.success).toBe(1);
    });
  });

  describe('updateNote - Sửa ghi chú khách hàng (regression bug 404 "Không tìm thấy khách hàng này")', () => {
    // ⚠️ BÁO CÁO GỐC (2026-09-08): Admin cấp `customer_notes.edit` (scope
    // 'own') cho Employee nhưng KHÔNG cấp `customer_notes.delete`. Employee
    // (Sales User 2) tạo được note trên 1 khách hàng (customer_notes.create
    // scope rộng hơn 'own' của Employee, vd 'department'), rồi quay lại
    // SỬA ĐÚNG note mình vừa tạo -> dính 404 "Không tìm thấy khách hàng
    // này" dù note chắc chắn là của mình. Nguyên nhân: code cũ hardcode
    // `assertCustomerAccessible(..., null)` cho nhánh scope='own' - null
    // rơi vào check ownership "cứng" (createdById/salesUserId/assignment),
    // BỎ QUA scope thật của `customers.view` (vd 'department'/'all') mà
    // Employee thực sự đang có. Test dưới đây khoá lại hành vi ĐÚNG sau
    // khi sửa: recheck khách hàng phải dùng scope thật của `customers.view`.
    function makeAccessQb(found: boolean) {
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(found ? { id: 148 } : null),
      };
      return qb;
    }

    const baseNote = { id: 10, customerId: 148, createdBy: 7, note: 'nội dung cũ' };

    beforeEach(() => {
      mockNoteRepo.findOne = jest.fn().mockResolvedValue({ ...baseNote });
      mockNoteRepo.merge = jest.fn((note: any, dto: any) => Object.assign(note, dto));
      mockNoteRepo.save = jest.fn((note: any) => Promise.resolve(note));
    });

    it('ĐÂY LÀ FIX CHO BUG GỐC: Employee (scope=own) sửa ĐÚNG note mình tạo, trên KH chỉ truy cập được nhờ customers.view scope=department -> KHÔNG còn bị 404', async () => {
      mockPermissionsService.hasPermission.mockImplementation((_role: string, key: string) => {
        if (key === 'customer_notes.edit') return Promise.resolve({ allowed: true, scope: PermissionScope.OWN });
        if (key === 'customers.view') return Promise.resolve({ allowed: true, scope: PermissionScope.DEPARTMENT });
        return Promise.resolve({ allowed: false, scope: null });
      });
      const qb = makeAccessQb(true);
      mockCustomerRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.updateNote(148, 10, { note: 'nội dung mới' } as any, 7, Role.EMPLOYEE, 3),
      ).resolves.toBeDefined();

      // Phải recheck bằng scope THẬT của customers.view ('department') -
      // KHÔNG phải Brackets ownership cứng như hành vi cũ (bug gốc).
      // Từ khi hệ thống chuyển sang multi-manager (bảng department_managers),
      // điều kiện phòng ban truy vấn qua department_managers thay vì cột
      // department.manager_user_id cũ.
      // ⚠️ Sau fix "department = superset of own" (xem
      // CustomerAccessHelper.applyViewFilter), nhánh 'department' giờ CŨNG
      // gói trong 1 Brackets (department_id IN ... OR 4 điều kiện own) thay
      // vì 1 chuỗi SQL đơn - nên phải mở whereFactory ra để assert đúng nội
      // dung bên trong, không còn so sánh string/params phẳng như trước.
      const deptRecheckCall = (qb.andWhere as jest.Mock).mock.calls.find(
        (call) => call[0] instanceof Brackets,
      );
      expect(deptRecheckCall).toBeDefined();
      const innerCalls: { sql: string; params?: any }[] = [];
      const innerQb: any = {
        where: (sql: string, params?: any) => { innerCalls.push({ sql, params }); return innerQb; },
        orWhere: (sql: string, params?: any) => { innerCalls.push({ sql, params }); return innerQb; },
      };
      (deptRecheckCall[0] as Brackets).whereFactory(innerQb);
      const deptCondition = innerCalls.find((c) => c.sql.includes('department_managers'));
      expect(deptCondition?.sql).toContain(
        'SELECT dm.department_id FROM department_managers dm WHERE dm.user_id = :accessManagerId',
      );
      expect(deptCondition?.params).toEqual({ accessManagerId: 7 });
    });

    it('scope=own + customers.view scope=all: vẫn sửa được (không đòi hỏi phải là chủ khách hàng)', async () => {
      mockPermissionsService.hasPermission.mockImplementation((_role: string, key: string) => {
        if (key === 'customer_notes.edit') return Promise.resolve({ allowed: true, scope: PermissionScope.OWN });
        if (key === 'customers.view') return Promise.resolve({ allowed: true, scope: PermissionScope.ALL });
        return Promise.resolve({ allowed: false, scope: null });
      });
      const qb = makeAccessQb(true);
      mockCustomerRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.updateNote(148, 10, { note: 'nội dung mới' } as any, 7, Role.EMPLOYEE, null),
      ).resolves.toBeDefined();
    });

    it('note KHÔNG phải do mình tạo -> luôn bị chặn 403, bất kể customers.view scope rộng cỡ nào', async () => {
      mockNoteRepo.findOne = jest.fn().mockResolvedValue({ ...baseNote, createdBy: 999 });
      mockPermissionsService.hasPermission.mockImplementation((_role: string, key: string) => {
        if (key === 'customer_notes.edit') return Promise.resolve({ allowed: true, scope: PermissionScope.OWN });
        return Promise.resolve({ allowed: false, scope: null });
      });

      await expect(
        service.updateNote(148, 10, { note: 'x' } as any, 7, Role.EMPLOYEE, null),
      ).rejects.toThrow('Bạn không có quyền sửa ghi chú này');
    });

    it('không có permission customer_notes.edit nào cả -> luôn bị chặn 403, kể cả note của chính mình', async () => {
      mockPermissionsService.hasPermission.mockResolvedValue({ allowed: false, scope: null });

      await expect(
        service.updateNote(148, 10, { note: 'x' } as any, 7, Role.EMPLOYEE, null),
      ).rejects.toThrow('Bạn không có quyền sửa ghi chú này');
    });

    it('ADMIN luôn sửa được, không tra permission nào (lối thoát hiểm cứng)', async () => {
      const qb = makeAccessQb(true);
      mockCustomerRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.updateNote(148, 10, { note: 'x' } as any, 1, Role.ADMIN, null),
      ).resolves.toBeDefined();
      expect(mockPermissionsService.hasPermission).not.toHaveBeenCalled();
    });
  });

  /**
   * ⚠️ FIX BUG THẬT (báo lỗi trực tiếp từ người dùng: cấp `customers.delete`
   * cho role không phải Admin qua trang "Phân quyền" vẫn không xoá mềm
   * được) - trước đây `remove()` gọi thêm `CustomerAccessHelper.canDelete()`
   * hardcode `role === admin`, phớt lờ hoàn toàn permission đã cấp. Test
   * này đảm bảo hành vi ĐÚNG: ai qua được `findOne()` (tức nằm trong phạm vi
   * xem của họ - đã được PermissionGuard xác nhận có `customers.delete`)
   * đều xoá mềm được, KHÔNG còn rào cản admin-only nào ở tầng service nữa.
   * Dùng `jest.spyOn(service, 'findOne')` thay vì dựng lại toàn bộ chuỗi
   * `createQueryBuilder(...).leftJoinAndSelect(...)...getOne()` của
   * `findOne()` (đã có test riêng gián tiếp qua các describe khác) - ở đây
   * chỉ cần khẳng định `remove()` KHÔNG tự áp thêm điều kiện role nào sau
   * khi `findOne()` đã trả về customer thành công.
   */
  describe('remove - Xoá mềm khách hàng (đưa vào thùng rác)', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('Role KHÔNG PHẢI admin (vd Employee) vẫn xoá mềm được nếu findOne() (đã qua PermissionGuard + applyViewFilter) trả về customer - không còn bị chặn cứng "chỉ Admin"', async () => {
      const fakeCustomer: any = { id: 55, createdById: 7, name: 'Nguyễn Văn A', phone: '0901234567' };
      jest.spyOn(service, 'findOne').mockResolvedValue(fakeCustomer);
      mockCustomerRepo.softDelete.mockResolvedValue({ affected: 1 });
      mockCustomerRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.remove(55, 7, Role.EMPLOYEE, PermissionScope.OWN);

      expect(mockCustomerRepo.softDelete).toHaveBeenCalledWith(55);
      expect(mockCustomerRepo.update).toHaveBeenCalledWith(55, { deletedById: 7 });
      // ⚠️ FIX BUG THẬT (báo lỗi trực tiếp kèm ảnh chụp màn hình: Xoá khách
      // hàng - mềm hay cứng - không lưu lại khách hàng đó là ai, "Chi tiết
      // hành động" hiện "Dữ liệu chính không thay đổi") - `remove()` giờ
      // PHẢI chụp snapshot (đọc được, mirror `hardDelete()`) làm `oldData`
      // TRƯỚC khi xoá, không còn gọi `logActionAsync()` thiếu 2 tham số cuối.
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        7,
        'DELETE_CUSTOMER',
        'customer',
        55,
        expect.objectContaining({ name: 'Nguyễn Văn A', phone: '0901234567' }),
        null,
      );
      expect(result).toEqual({ message: 'Xóa khách hàng thành công' });
    });

    it('Customer ngoài phạm vi xem (findOne() ném CustomerNotFoundException) -> KHÔNG xoá, lỗi được ném ra nguyên vẹn', async () => {
      jest.spyOn(service, 'findOne').mockRejectedValue(new CustomerNotFoundException());

      await expect(
        service.remove(999, 7, Role.EMPLOYEE, PermissionScope.OWN),
      ).rejects.toBeInstanceOf(CustomerNotFoundException);

      expect(mockCustomerRepo.softDelete).not.toHaveBeenCalled();
    });

    it('Admin vẫn xoá mềm được như trước (không bị ảnh hưởng bởi việc bỏ rào cản admin-only)', async () => {
      const fakeCustomer: any = { id: 1, createdById: 2 };
      jest.spyOn(service, 'findOne').mockResolvedValue(fakeCustomer);
      mockCustomerRepo.softDelete.mockResolvedValue({ affected: 1 });
      mockCustomerRepo.update.mockResolvedValue({ affected: 1 });

      await expect(
        service.remove(1, 99, Role.ADMIN, null),
      ).resolves.toEqual({ message: 'Xóa khách hàng thành công' });
      expect(mockCustomerRepo.softDelete).toHaveBeenCalledWith(1);
    });
  });

  /**
   * ⚠️ MỚI (yêu cầu người dùng): cột "Người xóa" ở trang Thùng rác. Dữ liệu
   * xóa mềm TRƯỚC migration `AddDeletedByToCustomers` có `deletedById =
   * NULL` - `getTrash()` phải tự dò `audit_logs` (qua
   * `AuditService.findLastActorsForEntities()`) để lấp khoảng trống này,
   * và tự "chữa lành" (ghi lại `deletedById`) để lần đọc sau không cần dò
   * lại nữa.
   */
  describe('getTrash - Danh sách thùng rác + fallback "Người xóa" qua audit log', () => {
    function makeTrashQb(rows: any[]) {
      const qb: any = {
        withDeleted: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([rows, rows.length]),
      };
      return qb;
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('Bản ghi đã có sẵn deletedById (đã xóa SAU migration) -> KHÔNG gọi audit log fallback', async () => {
      const rows = [{ id: 1, deletedById: 9, deletedBy: { id: 9, name: 'Sales A' } }];
      mockCustomerRepo.createQueryBuilder.mockReturnValue(makeTrashQb(rows));

      const result = await service.getTrash({ page: 1, limit: 20 } as any);

      expect(mockAuditService.findLastActorsForEntities).not.toHaveBeenCalled();
      expect(result.data).toEqual(rows);
    });

    it('Bản ghi CŨ thiếu deletedById -> dò audit log, gắn deletedBy vào response VÀ tự backfill lại DB', async () => {
      const rows = [{ id: 2, deletedById: null, deletedBy: null }];
      mockCustomerRepo.createQueryBuilder.mockReturnValue(makeTrashQb(rows));
      mockAuditService.findLastActorsForEntities.mockResolvedValueOnce(
        new Map([[2, 7]]),
      );
      const mockUserRepo = { findBy: jest.fn().mockResolvedValue([{ id: 7, name: 'Nguyễn Văn B' }]) };
      mockCustomerRepo.manager.getRepository.mockReturnValue(mockUserRepo);
      mockCustomerRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.getTrash({ page: 1, limit: 20 } as any);

      expect(mockAuditService.findLastActorsForEntities).toHaveBeenCalledWith(
        'customer',
        [2],
        'DELETE_CUSTOMER',
      );
      expect(result.data[0].deletedById).toBe(7);
      expect(result.data[0].deletedBy).toEqual({ id: 7, name: 'Nguyễn Văn B' });
      // Backfill chạy fire-and-forget nhưng phải được kích hoạt đúng tham số
      expect(mockCustomerRepo.update).toHaveBeenCalledWith(2, { deletedById: 7 });
    });

    it('Bản ghi CŨ thiếu deletedById nhưng audit log CŨNG không có gì -> vẫn trả về bình thường, deletedBy null', async () => {
      const rows = [{ id: 3, deletedById: null, deletedBy: null }];
      mockCustomerRepo.createQueryBuilder.mockReturnValue(makeTrashQb(rows));
      mockAuditService.findLastActorsForEntities.mockResolvedValueOnce(new Map());

      const result = await service.getTrash({ page: 1, limit: 20 } as any);

      expect(result.data[0].deletedBy).toBeNull();
    });
  });

  describe('getStats - Thống kê Dashboard', () => {
    function makeCountQb() {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        clone: jest.fn(),
        getCount: jest.fn().mockResolvedValue(0),
      };
      qb.clone.mockReturnValue(qb);
      return qb;
    }

    it('"Tổng nạp" CHỈ cộng deposit trong 30 ngày gần đây - khớp đúng khung thời gian với cột "Nạp tiền (30 ngày gần đây)" trên bảng (fix bug thật: trước đây cộng dồn TOÀN BỘ deposit từ trước tới giờ, gây lệch số với bảng - xem StatsCards.tsx)', async () => {
      const countQb = makeCountQb();
      mockCustomerRepo.createQueryBuilder.mockReturnValue(countQb);

      const depositAndWhereCalls: { sql: string; params?: any }[] = [];
      const depositQb: any = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn((sql: string, params?: any) => {
          depositAndWhereCalls.push({ sql, params });
          return depositQb;
        }),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '10' }),
      };
      mockDepositRepo.createQueryBuilder = jest.fn().mockReturnValue(depositQb);

      const result = await service.getStats(1, Role.ADMIN);

      // Phải có đúng 1 điều kiện lọc theo ngày (>= 30 ngày trước) trên
      // deposit.depositDate - không giới hạn nào khác (không có upper bound
      // dateTo vì đây là "N ngày gần đây tính tới hiện tại", không phải
      // khoảng tuỳ chọn).
      const dateCondition = depositAndWhereCalls.find((c) => c.sql.includes('deposit.depositDate >='));
      expect(dateCondition).toBeDefined();
      expect(dateCondition!.params).toHaveProperty('thirtyDaysAgo');
      expect(result.totalDepositAmount).toBe(10);
    });

    it('Có filter (vd status=closed, dateFrom/dateTo) -> thẻ "Tổng nạp" áp CÙNG điều kiện customer + CÙNG khung ngày deposit với cột "Nạp tiền" trên bảng', async () => {
      const countQb = makeCountQb();
      mockCustomerRepo.createQueryBuilder.mockReturnValue(countQb);

      const calls: { sql: string; params?: any }[] = [];
      const depositQb: any = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn((sql: string, params?: any) => {
          calls.push({ sql, params });
          return depositQb;
        }),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '500' }),
      };
      mockDepositRepo.createQueryBuilder = jest.fn().mockReturnValue(depositQb);

      const result = await service.getStats(1, Role.ADMIN, undefined, {
        status: 'closed',
        dateFrom: '2026-09-01',
        dateTo: '2026-09-21',
      } as any);

      expect(calls.some((c) => c.sql.includes('customer.status = :status') && c.params?.status === 'closed')).toBe(true);
      expect(calls.some((c) => c.sql.includes('deposit.depositDate >= :dateFrom'))).toBe(true);
      expect(calls.some((c) => c.sql.includes('deposit.depositDate <= :dateTo'))).toBe(true);
      // Có dateFrom/dateTo thì KHÔNG được fallback 30 ngày
      expect(calls.some((c) => c.params && 'thirtyDaysAgo' in c.params)).toBe(false);
      expect(result.totalDepositAmount).toBe(500);
    });
  });
  // ═══════════════════ Thông báo tự động (Notification Phase 3) ═══════════════════
  describe('Thông báo tự động (Phase 3)', () => {
    // notifySafely() là async - phần chuẩn bị cần đọc DB (createNote) chạy sau 1 tick.
    const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
    const emitted = () => mockNotificationsService.emit.mock.calls.map((c) => c[0]);
    const emittedOf = (type: string) => emitted().filter((e) => e.type === type);

    describe('flag TẮT (mặc định)', () => {
      it('create() không emit gì', async () => {
        mockCustomerRepo.create.mockImplementation((input: any) => input);
        mockCustomerRepo.save.mockImplementation((e: any) => Promise.resolve({ id: 1, ...e }));

        await service.create({ name: 'A', phone: '0912345678', salesUserId: undefined } as any, 1);
        await flush();

        expect(mockNotificationsService.emit).not.toHaveBeenCalled();
      });

      it('remove() không thêm query snapshot nào (findOne của repo không được gọi)', async () => {
        (mockCustomerRepo as any).findOne = jest.fn();
        jest.spyOn(service, 'findOne').mockResolvedValue({ id: 5, name: 'X' } as any);
        mockCustomerRepo.softDelete.mockResolvedValue({});
        mockCustomerRepo.update.mockResolvedValue({});

        await service.remove(5, 1, Role.ADMIN, null);
        await flush();

        expect((mockCustomerRepo as any).findOne).not.toHaveBeenCalled();
        expect(mockNotificationsService.emit).not.toHaveBeenCalled();
      });
    });

    describe('flag BẬT', () => {
      beforeEach(() => {
        mockNotificationsService.isEnabled.mockReturnValue(true);
        (mockCustomerRepo as any).findOne = jest.fn();
      });
      afterEach(() => jest.restoreAllMocks());

      it('create(): emit customer.created cho sales chính + marketing, KHÔNG kèm SĐT/email', async () => {
        const userRepo = { findOneBy: jest.fn().mockResolvedValue({ id: 5, isActive: true, name: 'S' }) };
        mockCustomerRepo.manager.getRepository.mockReturnValue(userRepo);
        mockCustomerRepo.create.mockImplementation((input: any) => input);
        mockCustomerRepo.save.mockImplementation((e: any) => Promise.resolve({ id: 77, ...e }));

        await service.create(
          { name: 'Nguyen A', phone: '0912345678', email: 'a@x.com', salesUserId: 5, marketingUserId: 6 } as any,
          1,
        );

        const [event] = emittedOf('customer.created');
        expect(event).toMatchObject({
          actorId: 1,
          entity: { type: 'customer', id: 77 },
          entityName: 'Nguyen A',
          recipients: { customer: { salesUserId: 5, marketingUserId: 6 } },
        });
        expect(JSON.stringify(event)).not.toContain('0912345678');
        expect(JSON.stringify(event)).not.toContain('a@x.com');
      });

      it('create(): emit ném lỗi vẫn KHÔNG làm hỏng việc tạo khách hàng (nguyên tắc 1)', async () => {
        mockCustomerRepo.create.mockImplementation((input: any) => input);
        mockCustomerRepo.save.mockImplementation((e: any) => Promise.resolve({ id: 3, ...e }));
        mockNotificationsService.emit.mockImplementation(() => {
          throw new Error('boom');
        });

        await expect(service.create({ name: 'A', phone: '0912345678' } as any, 1)).resolves.toMatchObject({ id: 3 });
      });

      describe('update()', () => {
        const pre = {
          id: 50,
          name: 'Khách 50',
          salesUserId: 5,
          marketingUserId: null,
          createdById: 2,
          status: 'pending',
          closedDate: null,
          departmentId: 1,
        };
        const userRepo = { findOneBy: jest.fn() };

        beforeEach(() => {
          mockCustomerRepo.manager.getRepository.mockReturnValue(userRepo);
          userRepo.findOneBy.mockResolvedValue({ id: 8, isActive: true, name: 'S8' });
          (mockCustomerRepo as any).findOne.mockResolvedValue({ ...pre });
          mockAssignmentRepo.find.mockResolvedValue([{ assignedToId: 9 }]);
          mockCustomerRepo.merge.mockImplementation((c: any, dto: any) => Object.assign(c, dto));
          mockCustomerRepo.save.mockImplementation((c: any) => Promise.resolve(c));
        });

        const runUpdate = async (dto: any) => {
          // Object mà findOne() của update() trả về CÓ THỂ đã bị UI Visibility xoá field
          // → cố tình bỏ salesUserId để chứng minh diff dùng snapshot riêng, không dùng object này.
          jest.spyOn(service, 'findOne').mockResolvedValue({ id: 50, name: 'Khách 50', status: 'pending' } as any);
          await service.update(50, dto, 1, Role.ADMIN, PermissionScope.ALL);
          await flush();
        };

        it('đổi Sales phụ trách → owner_changed (người mới/cũ) và KHÔNG báo customer.updated', async () => {
          await runUpdate({ salesUserId: 8 });

          expect(emittedOf('customer.owner_changed')).toHaveLength(1);
          expect(emittedOf('customer.owner_changed')[0]).toMatchObject({
            actorId: 1,
            entity: { type: 'customer', id: 50 },
            entityName: 'Khách 50',
            recipients: { newUserIds: [8], previousUserIds: [5] },
          });
          expect(emittedOf('customer.updated')).toHaveLength(0);
        });

        it('đổi trạng thái → customer.updated, gồm sales chính/được chia (chuyển sang "closed" tự set closedDate nên có cả 2 field)', async () => {
          await runUpdate({ status: 'closed' });

          expect(emittedOf('customer.owner_changed')).toHaveLength(0);
          const [ev] = emittedOf('customer.updated');
          // update() tự đặt closedDate = hôm nay khi status chuyển 'closed' lần đầu
          expect(ev.params).toEqual({ changedFields: ['status', 'closedDate'] });
          expect(ev.recipients.customer).toMatchObject({ salesUserId: 5, sharedSalesUserIds: [9] });
        });

        it('sửa field NGOÀI allowlist (vd broker/ghi chú) → im lặng', async () => {
          await runUpdate({ broker: 'XM', note: 'abc' });
          expect(mockNotificationsService.emit).not.toHaveBeenCalled();
        });

        it('vừa đổi sales vừa đổi status → người mới nhận owner_changed, KHÔNG nhận thêm customer.updated', async () => {
          await runUpdate({ salesUserId: 8, status: 'closed' });

          expect(emittedOf('customer.owner_changed')).toHaveLength(1);
          const [ev] = emittedOf('customer.updated');
          expect(ev.recipients.customer.salesUserId).toBeNull(); // 8 đã bị loại
          expect(ev.recipients.customer.sharedSalesUserIds).toEqual([9]);
        });

        it('gửi lại đúng giá trị cũ (không đổi gì) → im lặng', async () => {
          await runUpdate({ status: 'pending', salesUserId: 5 });
          expect(mockNotificationsService.emit).not.toHaveBeenCalled();
        });
      });

      it('remove(): snapshot TRƯỚC khi xoá + emit customer.deleted với params.unavailable', async () => {
        (mockCustomerRepo as any).findOne.mockResolvedValue({
          id: 55, name: 'Khách 55', salesUserId: 5, marketingUserId: 6, createdById: 2,
          status: 'pending', closedDate: null, departmentId: 1,
        });
        mockAssignmentRepo.find.mockResolvedValue([{ assignedToId: 9 }]);
        jest.spyOn(service, 'findOne').mockResolvedValue({ id: 55, name: 'Khách 55' } as any);
        const order: string[] = [];
        (mockCustomerRepo as any).findOne.mockImplementation(() => {
          order.push('snapshot');
          return Promise.resolve({ id: 55, name: 'Khách 55', salesUserId: 5, marketingUserId: 6, createdById: 2, status: 'pending', closedDate: null, departmentId: 1 });
        });
        mockCustomerRepo.softDelete.mockImplementation(() => {
          order.push('softDelete');
          return Promise.resolve({});
        });
        mockCustomerRepo.update.mockResolvedValue({});

        await service.remove(55, 1, Role.ADMIN, null);
        await flush();

        expect(order).toEqual(['snapshot', 'softDelete']);
        const [ev] = emittedOf('customer.deleted');
        expect(ev).toMatchObject({
          actorId: 1,
          entityName: 'Khách 55',
          params: { unavailable: true },
          recipients: { customer: { salesUserId: 5, marketingUserId: 6, sharedSalesUserIds: [9] } },
        });
      });

      it('createNote(): emit customer.note_created (subEntity=note), KHÔNG kèm nội dung ghi chú', async () => {
        const qb: any = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue({ id: 60 }),
        };
        mockCustomerRepo.createQueryBuilder.mockReturnValue(qb);
        (mockNoteRepo as any).create = jest.fn((x: any) => x);
        (mockNoteRepo as any).save = jest.fn((x: any) => Promise.resolve({ id: 900, ...x }));
        (mockNoteRepo as any).findOne = jest.fn().mockResolvedValue({ id: 900 });
        (mockCustomerRepo as any).findOne.mockResolvedValue({
          id: 60, name: 'Khách 60', salesUserId: 5, marketingUserId: null, createdById: 2,
          status: 'pending', closedDate: null, departmentId: 1,
        });
        mockAssignmentRepo.find.mockResolvedValue([]);

        await service.createNote(60, { note: 'SĐT 0999888777, nạp 5000$' } as any, 1, Role.ADMIN, PermissionScope.ALL);
        await flush();

        const [ev] = emittedOf('customer.note_created');
        expect(ev).toMatchObject({
          actorId: 1,
          entity: { type: 'customer', id: 60 },
          subEntity: { type: 'customer_note', id: 900 },
          entityName: 'Khách 60',
        });
        expect(JSON.stringify(ev)).not.toContain('0999888777');
      });

      describe('bulkAssign() - gộp theo người nhận', () => {
        beforeEach(() => {
          const userRepo = {
            find: jest.fn(({ where }: { where: { id: number }[] }) =>
              Promise.resolve(where.map((w) => ({ id: w.id, isActive: true }))),
            ),
          };
          mockCustomerRepo.manager.getRepository.mockReturnValue(userRepo);
          (mockAssignmentRepo as any).insert = jest.fn().mockResolvedValue({});
          mockCustomerRepo.createQueryBuilder.mockReturnValue({
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            whereInIds: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({}),
          });
        });

        it('N khách × M sales → tối đa 2 thông báo/người (không 1/khách); phân biệt phụ trách chính vs được chia', async () => {
          mockAssignmentRepo.find.mockResolvedValue([]);
          mockCustomerRepo.find.mockResolvedValue([
            { id: 100, name: 'K100', departmentId: null, salesUserId: null, createdById: 1 }, // chưa ai → 5 thành chính
            { id: 101, name: 'K101', departmentId: null, salesUserId: 9, createdById: 1 }, // đã có sales → thành "được chia"
          ]);

          await service.bulkAssign([100, 101], [5, 6], 1, Role.ADMIN, undefined, PermissionScope.ALL);

          const events = emittedOf('customer.assigned');
          expect(events).toHaveLength(3); // 5-primary(1 khách), 5-shared(1 khách), 6-shared(2 khách)
          const byKey = (uid: number, primary: boolean) =>
            events.find((e) => e.recipients.newUserIds[0] === uid && e.params.isPrimary === primary);

          expect(byKey(5, true)).toMatchObject({ count: 1, entity: { type: 'customer', id: 100 }, entityName: 'K100' });
          expect(byKey(5, false)).toMatchObject({ count: 1, entity: { type: 'customer', id: 101 } });
          expect(byKey(6, false)).toMatchObject({ count: 2, entity: { type: 'customer', id: null }, entityName: '' });
          expect(byKey(6, false).params.entityIds).toEqual([100, 101]);
          // dedupeSuffix khác nhau giữa các nhóm → không tự "nuốt" nhau qua uk_recipient_dedupe
          expect(new Set(events.map((e) => e.dedupeSuffix)).size).toBe(3);
        });

        it('lượt gán ACTIVE đã tồn tại và không đổi vai trò → KHÔNG báo lặp', async () => {
          mockAssignmentRepo.find.mockResolvedValue([{ customerId: 101, assignedToId: 5 }]);
          mockCustomerRepo.find.mockResolvedValue([
            { id: 101, name: 'K101', departmentId: null, salesUserId: 9, createdById: 1 },
          ]);

          await service.bulkAssign([101], [5], 1, Role.ADMIN, undefined, PermissionScope.ALL);

          expect(emittedOf('customer.assigned')).toHaveLength(0);
        });

        it('khách bị từ chối phân quyền → không có thông báo cho khách đó', async () => {
          mockAssignmentRepo.find.mockResolvedValue([]);
          mockCustomerRepo.find.mockResolvedValue([
            { id: 100, name: 'K100', departmentId: null, salesUserId: 99, createdById: 7 },
          ]);

          await service.bulkAssign([100], [5], 7, Role.EMPLOYEE, undefined, PermissionScope.OWN);

          expect(mockNotificationsService.emit).not.toHaveBeenCalled();
        });
      });

      describe('updateAssignment() / reclaimAssignment()', () => {
        const userRepo = { findOneBy: jest.fn() };
        beforeEach(() => mockCustomerRepo.manager.getRepository.mockReturnValue(userRepo));
        const makeAssignment = () => ({
          id: 10, customerId: 100, assignedById: 2, assignedToId: 5,
          status: AssignmentStatus.ACTIVE, reason: 'cũ',
          customer: { id: 100, name: 'K100', salesUserId: 5, updatedById: null },
        });

        it('đổi người → assignment_changed (mới/cũ + sales chính SAU khi đồng bộ)', async () => {
          mockAssignmentRepo.findOne.mockResolvedValueOnce(makeAssignment()).mockResolvedValueOnce(null);
          userRepo.findOneBy.mockResolvedValue({ id: 7, isActive: true, name: 'S7' });
          mockAssignmentRepo.save.mockImplementation((a: any) => Promise.resolve(a));
          mockCustomerRepo.save.mockResolvedValue({});

          await service.updateAssignment(10, { assignedToId: 7 }, 1, Role.ADMIN, PermissionScope.ALL);

          expect(emittedOf('customer.assignment_changed')[0]).toMatchObject({
            actorId: 1,
            entity: { type: 'customer', id: 100 },
            entityName: 'K100',
            recipients: { newUserIds: [7], previousUserIds: [5], customer: { salesUserId: 7 } },
          });
        });

        it('chỉ đổi lý do → im lặng', async () => {
          mockAssignmentRepo.findOne.mockResolvedValueOnce(makeAssignment());
          mockAssignmentRepo.save.mockImplementation((a: any) => Promise.resolve(a));

          await service.updateAssignment(10, { reason: 'mới' }, 1, Role.ADMIN, PermissionScope.ALL);

          expect(mockNotificationsService.emit).not.toHaveBeenCalled();
        });

        it('reclaim → assignment_reclaimed cho ĐÚNG người bị thu hồi', async () => {
          mockAssignmentRepo.findOne.mockResolvedValue(makeAssignment());
          mockAssignmentRepo.save.mockResolvedValue({});
          mockAssignmentRepo.find.mockResolvedValue([]);
          mockCustomerRepo.save.mockResolvedValue({});

          await service.reclaimAssignment(10, 1, Role.ADMIN, PermissionScope.ALL);

          expect(emittedOf('customer.assignment_reclaimed')[0]).toMatchObject({
            actorId: 1,
            entity: { type: 'customer', id: 100 },
            entityName: 'K100',
            recipients: { previousUserIds: [5] },
          });
        });
      });
    });
  });

  // ⚠️ FIX BUG THẬT (500 "Duplicate column name 'dup_key'" khi vào
  // /customers/reports/invalid-data?invalidType=duplicate_phone): bản cũ
  // dùng 1 QueryBuilder VỪA leftJoinAndSelect VỪA addSelect(dup_key) +
  // orderBy(dup_key) + skip/take + getManyAndCount() cùng lúc - TypeORM
  // 0.3.28 bọc thêm 1 subquery phân trang khi có JOIN, add trùng cột
  // `dup_key` vào đó -> MySQL báo "Duplicate column name 'dup_key'". Sửa:
  // tách hẳn thành 5 bước/QueryBuilder độc lập (dupKeysQb tìm giá trị trùng
  // -> countQb đếm tổng -> idsQb lấy id đã sắp/phân trang, KHÔNG JOIN gì ->
  // peersQb lấy toàn bộ (id,tên) của các nhóm trùng để tính "trùng với ai"
  // -> query cuối lấy full data theo id bằng IN(), KHÔNG skip/take). Test
  // dưới đây khoá lại ĐÚNG hình dạng mới này, không còn addSelect/orderBy
  // dup_key trên 1 query có JOIN nữa.
  describe('getInvalidDataReport / getDuplicateContactReport - Báo cáo trùng SĐT/Email', () => {
    function makeDupKeysQb(dupRows: { dupKey: string }[]) {
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(dupRows),
      };
      return qb;
    }

    function makeCountQb(total: number) {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(total),
      };
      return qb;
    }

    function makeIdsQb(idRows: { id: number; dup_key: string }[]) {
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(idRows),
      };
      return qb;
    }

    function makePeersQb(peerRows: { id: number; name: string; dup_key: string }[]) {
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(peerRows),
      };
      return qb;
    }

    function makeFinalQb(rows: any[]) {
      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(rows),
      };
      return qb;
    }

    it('duplicate_email: KHÔNG addSelect/orderBy dup_key trên query có JOIN - idsQb (không JOIN) mới là nơi order/skip/take', async () => {
      const dupKeysQb = makeDupKeysQb([{ dupKey: 'a@gmail.com' }]);
      const countQb = makeCountQb(2);
      const idsQb = makeIdsQb([
        { id: 1, dup_key: 'a@gmail.com' },
        { id: 2, dup_key: 'a@gmail.com' },
      ]);
      const peersQb = makePeersQb([
        { id: 1, name: 'A', dup_key: 'a@gmail.com' },
        { id: 2, name: 'B', dup_key: 'a@gmail.com' },
      ]);
      const finalQb = makeFinalQb([
        { id: 1, email: 'a@gmail.com', name: 'A' },
        { id: 2, email: 'A@Gmail.com', name: 'B' },
      ]);
      mockCustomerRepo.createQueryBuilder
        .mockReturnValueOnce(dupKeysQb)
        .mockReturnValueOnce(countQb)
        .mockReturnValueOnce(idsQb)
        .mockReturnValueOnce(peersQb)
        .mockReturnValueOnce(finalQb);

      const result: any = await service.getInvalidDataReport(
        1, Role.ADMIN, 'duplicate_email', 1, 20, PermissionScope.ALL,
      );

      // idsQb - KHÔNG có leftJoinAndSelect nào (không có key này) - đây là
      // điểm mấu chốt né được bug "Duplicate column name" của TypeORM.
      expect(idsQb.leftJoinAndSelect).toBeUndefined();
      expect(idsQb.addSelect).toHaveBeenCalledWith('LOWER(TRIM(customer.email))', 'dup_key');
      const orderByArg = idsQb.orderBy.mock.calls[0][0];
      expect(orderByArg).not.toContain('.');
      expect(idsQb.orderBy).toHaveBeenCalledWith('dup_key', 'ASC');
      expect(idsQb.skip).toHaveBeenCalled();
      expect(idsQb.take).toHaveBeenCalledWith(20);

      // finalQb (có JOIN) không hề gọi skip/take/orderBy theo dup_key.
      expect(finalQb.leftJoinAndSelect).toHaveBeenCalled();

      expect(result.invalidType).toBe('duplicate_email');
      expect(result.duplicateGroupCount).toBe(1);
      expect(result.total).toBe(2);
      expect(result.data[0].duplicateGroupKey).toBe('a@gmail.com');
      // Chuẩn hoá LOWER/TRIM đúng yêu cầu (không phân biệt hoa/thường).
      expect(result.data[1].duplicateGroupKey).toBe('a@gmail.com');
      // "Trùng với ai" - mỗi dòng thấy đúng dòng còn lại trong nhóm, loại
      // trừ chính mình.
      expect(result.data[0].duplicatePeers).toEqual([{ id: 2, name: 'B' }]);
      expect(result.data[1].duplicatePeers).toEqual([{ id: 1, name: 'A' }]);
    });

    it('duplicate_phone: vẫn hoạt động bình thường (groupExpr là alias.column thật, không phải biểu thức raw)', async () => {
      const dupKeysQb = makeDupKeysQb([{ dupKey: '0901234567' }]);
      const countQb = makeCountQb(2);
      const idsQb = makeIdsQb([
        { id: 1, dup_key: '0901234567' },
        { id: 2, dup_key: '0901234567' },
      ]);
      const peersQb = makePeersQb([
        { id: 1, name: 'A', dup_key: '0901234567' },
        { id: 2, name: 'B', dup_key: '0901234567' },
      ]);
      const finalQb = makeFinalQb([
        { id: 1, phone: '0901234567', name: 'A' },
        { id: 2, phone: '0901234567', name: 'B' },
      ]);
      mockCustomerRepo.createQueryBuilder
        .mockReturnValueOnce(dupKeysQb)
        .mockReturnValueOnce(countQb)
        .mockReturnValueOnce(idsQb)
        .mockReturnValueOnce(peersQb)
        .mockReturnValueOnce(finalQb);

      const result: any = await service.getInvalidDataReport(
        1, Role.ADMIN, 'duplicate_phone', 1, 20, PermissionScope.ALL,
      );

      expect(idsQb.addSelect).toHaveBeenCalledWith('customer.phone', 'dup_key');
      expect(idsQb.orderBy).toHaveBeenCalledWith('dup_key', 'ASC');
      expect(result.duplicateGroupCount).toBe(1);
      expect(result.data[0].duplicateGroupKey).toBe('0901234567');
    });

    it('không có giá trị nào trùng → trả về rỗng, KHÔNG gọi tới các query sau (tránh query thừa)', async () => {
      const dupKeysQb = makeDupKeysQb([]);
      mockCustomerRepo.createQueryBuilder.mockReturnValueOnce(dupKeysQb);

      const result: any = await service.getInvalidDataReport(
        1, Role.ADMIN, 'duplicate_phone', 1, 20, PermissionScope.ALL,
      );

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.duplicateGroupCount).toBe(0);
      expect(mockCustomerRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    });
  });

  // ⚠️ MỚI: khoá lại 2 điểm quan trọng nhất của checkDuplicateContact() -
  // (1) CỐ TÌNH bypass applyViewFilter (không có andWhere phân quyền nào
  // được gọi thêm ngoài `deletedAt IS NULL` + điều kiện phone/email) - đúng
  // ý đồ "exception tạm thời xem xuyên phạm vi quyền" người dùng yêu cầu;
  // (2) response CHỈ chứa đúng 3 field tối thiểu, không có `id`/full record.
  describe('checkDuplicateContact - Kiểm tra trùng SĐT/Email trước khi tạo (Modal cảnh báo)', () => {
    // ⚠️ QUAN TRỌNG: `jest.clearAllMocks()` ở beforeEach ngoài cùng (dòng
    // 120) chỉ xoá LỊCH SỬ gọi (mock.calls), KHÔNG xoá hàng đợi
    // `mockReturnValueOnce()` chưa dùng hết - nếu 1 test chỉ trigger ÍT hơn
    // số lần createQueryBuilder() đã queue (vd truyền phone=null nên nhánh
    // phone không hề gọi tới), giá trị dư sẽ TRÔI SANG test kế tiếp và làm
    // sai lệch kết quả (đã thật sự gặp lỗi này khi viết). `mockReset()`
    // riêng ở đây xoá sạch cả hàng đợi, đảm bảo mỗi test luôn bắt đầu từ
    // hàng đợi rỗng.
    beforeEach(() => {
      mockCustomerRepo.createQueryBuilder.mockReset();
    });

    function makeCustomerLookupQb(found: any) {
      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(found),
      };
      return qb;
    }

    function makeMembershipRepo(groupNames: string[]) {
      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(groupNames.map((name) => ({ group: { name } }))),
      };
      return { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    }

    it('không trùng SĐT lẫn Email -> hasDuplicate=false, không match nào', async () => {
      const phoneQb = makeCustomerLookupQb(null);
      const emailQb = makeCustomerLookupQb(null);
      mockCustomerRepo.createQueryBuilder
        .mockReturnValueOnce(phoneQb)
        .mockReturnValueOnce(emailQb);

      const result = await service.checkDuplicateContact('0901234567', 'a@gmail.com');

      expect(result).toEqual({ hasDuplicate: false, phoneMatch: null, emailMatch: null });
      // KHÔNG có andWhere phân quyền nào ngoài đúng 1 điều kiện phone/email -
      // xác nhận applyViewFilter() KHÔNG được gọi (bypass đúng ý đồ).
      expect(phoneQb.andWhere).toHaveBeenCalledTimes(1);
      expect(emailQb.andWhere).toHaveBeenCalledTimes(1);
    });

    it('trùng SĐT với khách của người khác -> trả về ĐÚNG 3 field tối thiểu, KHÔNG có id/note/phone', async () => {
      const existing = {
        id: 999,
        phone: '0901234567',
        note: 'Ghi chú riêng tư',
        createdBy: { name: 'Lê Hoàng Tuấn' },
        salesUser: { name: 'Nguyễn Sales' },
      };
      const phoneQb = makeCustomerLookupQb(existing);
      const emailQb = makeCustomerLookupQb(null);
      mockCustomerRepo.createQueryBuilder
        .mockReturnValueOnce(phoneQb)
        .mockReturnValueOnce(emailQb);
      mockCustomerRepo.manager.getRepository.mockReturnValue(
        makeMembershipRepo(['Nhóm Zalo A', 'Nhóm FB B']),
      );

      const result = await service.checkDuplicateContact('0901234567', null);

      expect(result.hasDuplicate).toBe(true);
      expect(result.phoneMatch).toEqual({
        creatorName: 'Lê Hoàng Tuấn',
        salesUserName: 'Nguyễn Sales',
        groupNames: ['Nhóm Zalo A', 'Nhóm FB B'],
      });
      // Không lộ id/phone/note của bản ghi đã tồn tại ra response.
      expect(result.phoneMatch).not.toHaveProperty('id');
      expect(result.phoneMatch).not.toHaveProperty('note');
      expect(result.phoneMatch).not.toHaveProperty('phone');
    });

    it('email chuẩn hoá LOWER/TRIM trước khi so khớp trùng', async () => {
      // phone=null → nhánh phone bị bỏ qua hoàn toàn trong service (không
      // gọi createQueryBuilder() lần nào cho phone) → CHỈ được queue đúng 1
      // giá trị (emailQb) ở đây. Trước đó test này lỡ queue thêm phoneQb ở
      // đầu hàng đợi dù nhánh phone không chạy → giá trị đó bị dùng NHẦM cho
      // lần gọi createQueryBuilder() duy nhất (email), khiến assertion dưới
      // kiểm tra sai object (phoneQb.andWhere thay vì emailQb.andWhere).
      const emailQb = makeCustomerLookupQb({ id: 5, createdBy: null, salesUser: null });
      mockCustomerRepo.createQueryBuilder.mockReturnValueOnce(emailQb);
      mockCustomerRepo.manager.getRepository.mockReturnValue(makeMembershipRepo([]));

      await service.checkDuplicateContact(null, '  A@Gmail.com  ');

      expect(emailQb.andWhere).toHaveBeenCalledWith(
        'LOWER(TRIM(customer.email)) = :email',
        { email: 'a@gmail.com' },
      );
    });

    it('excludeCustomerId -> loại trừ chính bản ghi đang sửa khỏi kết quả trùng', async () => {
      const phoneQb = makeCustomerLookupQb(null);
      mockCustomerRepo.createQueryBuilder.mockReturnValueOnce(phoneQb);

      await service.checkDuplicateContact('0901234567', null, 42);

      expect(phoneQb.andWhere).toHaveBeenCalledWith('customer.id != :excludeId', { excludeId: 42 });
    });
  });
});