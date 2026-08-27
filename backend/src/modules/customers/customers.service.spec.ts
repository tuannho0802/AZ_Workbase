import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerNote } from '../../database/entities/customer-note.entity';
import { Deposit } from '../../database/entities/deposit.entity';
import {
  CustomerAssignment,
  AssignmentStatus,
} from '../../database/entities/customer-assignment.entity';
import { AuditService } from '../audit/audit.service';
import {
  DuplicatePhoneException,
  UnauthorizedCustomerAccessException,
} from './exceptions/customer.exceptions';
import { Role } from '../../common/enums/role.enum';

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
        service.reclaimAssignment(999, 1, Role.ADMIN),
      ).rejects.toThrow(NotFoundException);
    });

    it('ném BadRequestException nếu assignment không còn ACTIVE', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue(makeAssignment({ status: AssignmentStatus.RECLAIMED }));

      await expect(
        service.reclaimAssignment(10, 1, Role.ADMIN),
      ).rejects.toThrow(BadRequestException);
    });

    it('ném UnauthorizedCustomerAccessException nếu người gọi không phải Admin/Manager và không phải người tạo', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue(makeAssignment());

      // caller id=999, role EMPLOYEE, không trùng assignedById=2
      await expect(
        service.reclaimAssignment(10, 999, Role.EMPLOYEE),
      ).rejects.toThrow(UnauthorizedCustomerAccessException);
    });

    it('cho phép chính người đã tạo assignment (assignedById) thu hồi dù không phải Admin/Manager', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue(makeAssignment());
      mockAssignmentRepo.save.mockResolvedValue({});
      mockAssignmentRepo.find.mockResolvedValue([]); // không còn assignee active nào khác
      mockCustomerRepo.save.mockResolvedValue({});

      // caller id=2 (đúng assignedById), role EMPLOYEE - vẫn được phép
      const result = await service.reclaimAssignment(10, 2, Role.EMPLOYEE);

      expect(result).toEqual({ message: 'Đã thu hồi lượt gán data thành công' });
    });

    it('set customer.salesUserId = NULL khi thu hồi assignee ACTIVE duy nhất', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue(makeAssignment());
      mockAssignmentRepo.save.mockResolvedValue({});
      mockAssignmentRepo.find.mockResolvedValue([]); // không còn ai active khác
      mockCustomerRepo.save.mockResolvedValue({});

      await service.reclaimAssignment(10, 1, Role.ADMIN);

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

      await service.reclaimAssignment(10, 1, Role.ADMIN);

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

      await service.reclaimAssignment(10, 1, Role.ADMIN);

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
        service.updateAssignment(999, { reason: 'x' }, 1, Role.ADMIN),
      ).rejects.toThrow(NotFoundException);
    });

    it('ném BadRequestException nếu assignment không còn ACTIVE', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue({
        ...baseAssignment,
        status: AssignmentStatus.RECLAIMED,
      });

      await expect(
        service.updateAssignment(10, { reason: 'x' }, 1, Role.ADMIN),
      ).rejects.toThrow(BadRequestException);
    });

    it('ném UnauthorizedCustomerAccessException nếu người gọi không có quyền', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue({ ...baseAssignment });

      await expect(
        service.updateAssignment(10, { reason: 'x' }, 999, Role.EMPLOYEE),
      ).rejects.toThrow(UnauthorizedCustomerAccessException);
    });

    it('chỉ sửa reason - không đụng gì tới assignedToId/customer', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue({ ...baseAssignment });
      mockAssignmentRepo.save.mockImplementation((a: any) => Promise.resolve(a));

      const result = await service.updateAssignment(
        10,
        { reason: 'Lý do mới' },
        1,
        Role.ADMIN,
      );

      expect(result.reason).toBe('Lý do mới');
      expect(result.assignedToId).toBe(5); // không đổi
      expect(mockCustomerRepo.save).not.toHaveBeenCalled();
    });

    it('ném BadRequestException nếu đổi sang user không tồn tại/đã khoá', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue({ ...baseAssignment });
      mockUserRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.updateAssignment(10, { assignedToId: 999 }, 1, Role.ADMIN),
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
        service.updateAssignment(10, { assignedToId: 7 }, 1, Role.ADMIN),
      ).rejects.toThrow(BadRequestException);
    });

    it('đổi assignedToId thành công + cập nhật customer.salesUserId nếu assignment đang là chủ sở hữu chính', async () => {
      mockAssignmentRepo.findOne
        .mockResolvedValueOnce({ ...baseAssignment }) // lấy assignment đang sửa
        .mockResolvedValueOnce(null); // check trùng -> không trùng
      mockUserRepo.findOneBy.mockResolvedValue({ id: 7, isActive: true, name: 'Sales 7' });
      mockAssignmentRepo.save.mockImplementation((a: any) => Promise.resolve(a));
      mockCustomerRepo.save.mockResolvedValue({});

      const result = await service.updateAssignment(10, { assignedToId: 7 }, 1, Role.ADMIN);

      expect(result.assignedToId).toBe(7);
      expect(result.previousAssigneeId).toBe(5); // lưu lại người cũ
      expect(mockCustomerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ salesUserId: 7 }),
      );
    });
  });
});