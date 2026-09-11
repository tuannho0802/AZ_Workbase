import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { Department } from '../../database/entities/department.entity';
import { DepartmentManager } from '../../database/entities/department-manager.entity';
import { User } from '../../database/entities/user.entity';
import { Customer } from '../../database/entities/customer.entity';
import { AuditService } from '../audit/audit.service';
import { Role } from '../../common/enums/role.enum';

describe('DepartmentsService', () => {
  let service: DepartmentsService;

  const mockDepartmentRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    merge: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  };
  const mockUserRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  // Thêm sau khi DepartmentsService có thêm remove() (xoá phòng ban, hỗ trợ
  // moveUsersToDepartmentId) - cần đếm/di chuyển customer thuộc phòng ban
  // bị xoá, nên constructor giờ có thêm CustomerRepository + AuditService.
  const mockCustomerRepo = {
    count: jest.fn(),
    update: jest.fn(),
  };
  const mockAuditService = {
    logAction: jest.fn(),
    logActionAsync: jest.fn(),
  };
  // ⚠️ MỚI (multi-manager) - DepartmentsService giờ inject thêm
  // DepartmentManagerRepository (bảng nhiều-nhiều department_managers) -
  // dùng ở findAll() (đọc danh sách managers/phòng ban) và update() (thay
  // toàn bộ danh sách Manager qua transaction xoá-rồi-chèn lại).
  const mockTransactionEntityManager = {
    delete: jest.fn().mockResolvedValue({}),
    insert: jest.fn().mockResolvedValue({}),
  };
  const mockDepartmentManagerRepo = {
    find: jest.fn(),
    manager: {
      transaction: jest.fn((cb: any) => cb(mockTransactionEntityManager)),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDepartmentManagerRepo.manager.transaction.mockImplementation((cb: any) =>
      cb(mockTransactionEntityManager),
    );
    mockDepartmentManagerRepo.find.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepartmentsService,
        { provide: getRepositoryToken(Department), useValue: mockDepartmentRepo },
        { provide: getRepositoryToken(DepartmentManager), useValue: mockDepartmentManagerRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Customer), useValue: mockCustomerRepo },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<DepartmentsService>(DepartmentsService);
  });

  it('nên khởi tạo thành công service', () => {
    expect(service).toBeDefined();
  });

  describe('findAll - Danh sách phòng ban kèm preview nhân viên (User 1 +N)', () => {
    it('trả về [] ngay, KHÔNG query user, nếu chưa có phòng ban nào', async () => {
      mockDepartmentRepo.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
      expect(mockUserRepo.find).not.toHaveBeenCalled();
    });

    it('gom đúng nhân viên vào đúng phòng ban tương ứng (2 query, không N+1)', async () => {
      mockDepartmentRepo.find.mockResolvedValue([
        { id: 1, name: 'MKT' },
        { id: 2, name: 'Sales' },
      ]);
      mockUserRepo.find.mockResolvedValue([
        { id: 10, name: 'Anh A', departmentId: 1 },
        { id: 11, name: 'Chị B', departmentId: 1 },
        { id: 12, name: 'Anh C', departmentId: 2 },
      ]);

      const result = await service.findAll();

      expect(mockUserRepo.find).toHaveBeenCalledTimes(1); // đúng 1 query cho MỌI phòng ban
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 1,
          employees: [
            { id: 10, name: 'Anh A' },
            { id: 11, name: 'Chị B' },
          ],
        }),
      );
      expect(result[1]).toEqual(
        expect.objectContaining({ id: 2, employees: [{ id: 12, name: 'Anh C' }] }),
      );
    });

    it('phòng ban không có nhân viên nào -> employees=[] (không bị undefined/lỗi)', async () => {
      mockDepartmentRepo.find.mockResolvedValue([{ id: 1, name: 'MKT' }]);
      mockUserRepo.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result[0].employees).toEqual([]);
    });

    it('bỏ qua user chưa có departmentId (null) - không crash, không gán nhầm phòng ban', async () => {
      mockDepartmentRepo.find.mockResolvedValue([{ id: 1, name: 'MKT' }]);
      mockUserRepo.find.mockResolvedValue([{ id: 99, name: 'Chưa gán phòng', departmentId: null }]);

      const result = await service.findAll();

      expect(result[0].employees).toEqual([]);
    });
  });


  describe('findAllPublic - Danh sách công khai (KHÔNG cần đăng nhập)', () => {
    it('chỉ lọc isActive=true, chỉ select id/name (không lộ field khác)', async () => {
      mockDepartmentRepo.find.mockResolvedValue([]);

      await service.findAllPublic();

      expect(mockDepartmentRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
          select: ['id', 'name'],
        }),
      );
    });
  });

  // ⚠️ MỚI (2026-09-11): thay cột đơn managerUserId (1-1) bằng
  // managerUserIds (mảng, nhiều-nhiều qua bảng department_managers) - cho
  // phép NHIỀU Manager/Assistant cùng quản lý 1 phòng ban. Xem
  // departments.service.ts update() + department-manager.entity.ts.
  describe('update - managerUserIds (multi-manager, thay thế managerUserId cũ)', () => {
    const existingDepartment = () => ({ id: 1, name: 'Kinh doanh' });

    it('ném NotFoundException nếu phòng ban không tồn tại', async () => {
      mockDepartmentRepo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { managerUserIds: [5] } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ném ConflictException nếu đổi tên trùng phòng ban khác đã có', async () => {
      mockDepartmentRepo.findOne
        .mockResolvedValueOnce(existingDepartment()) // findOne(id) trong findOne()
        .mockResolvedValueOnce({ id: 2, name: 'Trùng tên' }); // check trùng tên

      await expect(
        service.update(1, { name: 'Trùng tên' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('KHÔNG đụng gì tới department_managers nếu DTO không truyền managerUserIds (undefined)', async () => {
      mockDepartmentRepo.findOne.mockResolvedValueOnce(existingDepartment());
      mockDepartmentRepo.save.mockImplementation((d: any) => Promise.resolve(d));

      await service.update(1, { name: 'Tên mới' } as any);

      expect(mockUserRepo.find).not.toHaveBeenCalled();
      expect(mockDepartmentManagerRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('cho phép gỡ HẾT Manager (managerUserIds = []) mà KHÔNG cần validate user - chỉ xoá, không insert', async () => {
      mockDepartmentRepo.findOne.mockResolvedValueOnce(existingDepartment());
      mockDepartmentRepo.save.mockImplementation((d: any) => Promise.resolve(d));
      mockDepartmentManagerRepo.find.mockResolvedValue([]); // sau khi xoá -> rỗng

      const result = await service.update(1, { managerUserIds: [] } as any);

      expect(mockUserRepo.find).not.toHaveBeenCalled();
      expect(mockTransactionEntityManager.delete).toHaveBeenCalledWith(DepartmentManager, {
        departmentId: 1,
      });
      expect(mockTransactionEntityManager.insert).not.toHaveBeenCalled();
      expect(result.managerUserIds).toEqual([]);
    });

    it('ném NotFoundException nếu 1 trong các managerUserIds trỏ tới user không tồn tại', async () => {
      mockDepartmentRepo.findOne.mockResolvedValueOnce(existingDepartment());
      mockUserRepo.find.mockResolvedValue([{ id: 5, role: Role.MANAGER, isActive: true }]); // thiếu id=6

      await expect(service.update(1, { managerUserIds: [5, 6] } as any)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockDepartmentRepo.save).not.toHaveBeenCalled();
      expect(mockDepartmentManagerRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('⚠️ ném BadRequestException nếu 1 user được gán KHÔNG thuộc nhóm role Admin/Assistant/Manager (vd Employee) - chặn gán nhầm làm sai lệch phạm vi phân quyền toàn hệ thống', async () => {
      mockDepartmentRepo.findOne.mockResolvedValueOnce(existingDepartment());
      mockUserRepo.find.mockResolvedValue([{ id: 5, role: Role.EMPLOYEE, isActive: true }]);

      await expect(service.update(1, { managerUserIds: [5] } as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockDepartmentRepo.save).not.toHaveBeenCalled();
      expect(mockDepartmentManagerRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('⚠️ ném BadRequestException nếu 1 Manager được gán đang bị khoá (isActive=false)', async () => {
      mockDepartmentRepo.findOne.mockResolvedValueOnce(existingDepartment());
      mockUserRepo.find.mockResolvedValue([{ id: 5, role: Role.MANAGER, isActive: false }]);

      await expect(service.update(1, { managerUserIds: [5] } as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockDepartmentRepo.save).not.toHaveBeenCalled();
      expect(mockDepartmentManagerRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('cho phép gán role ASSISTANT/ADMIN làm manager phòng ban (không chỉ riêng role MANAGER)', async () => {
      mockDepartmentRepo.findOne.mockResolvedValueOnce(existingDepartment());
      mockUserRepo.find.mockResolvedValue([
        { id: 5, role: Role.ASSISTANT, isActive: true },
        { id: 6, role: Role.ADMIN, isActive: true },
      ]);
      mockDepartmentRepo.save.mockImplementation((d: any) => Promise.resolve(d));
      mockDepartmentManagerRepo.find.mockResolvedValue([
        { departmentId: 1, userId: 5 },
        { departmentId: 1, userId: 6 },
      ]);

      const result = await service.update(1, { managerUserIds: [5, 6] } as any);

      expect(result.managerUserIds).toEqual([5, 6]);
    });

    it('gán thành công NHIỀU Manager cùng lúc (khác biệt cốt lõi so với managerUserId đơn 1-1 cũ): xoá hết rồi chèn lại trong 1 transaction', async () => {
      mockDepartmentRepo.findOne.mockResolvedValueOnce(existingDepartment());
      mockUserRepo.find.mockResolvedValue([
        { id: 5, role: Role.MANAGER, isActive: true },
        { id: 7, role: Role.MANAGER, isActive: true },
      ]);
      mockDepartmentRepo.save.mockImplementation((d: any) => Promise.resolve(d));
      mockDepartmentManagerRepo.find.mockResolvedValue([
        { departmentId: 1, userId: 5 },
        { departmentId: 1, userId: 7 },
      ]);

      const result = await service.update(1, { managerUserIds: [5, 7] } as any);

      expect(mockDepartmentManagerRepo.manager.transaction).toHaveBeenCalledTimes(1);
      expect(mockTransactionEntityManager.delete).toHaveBeenCalledWith(DepartmentManager, {
        departmentId: 1,
      });
      expect(mockTransactionEntityManager.insert).toHaveBeenCalledWith(DepartmentManager, [
        { departmentId: 1, userId: 5 },
        { departmentId: 1, userId: 7 },
      ]);
      expect(result.managerUserIds).toEqual([5, 7]);
      expect(mockDepartmentRepo.save).toHaveBeenCalled();
    });

    it('tự loại id trùng lặp trong managerUserIds trước khi validate/insert (dedupe)', async () => {
      mockDepartmentRepo.findOne.mockResolvedValueOnce(existingDepartment());
      mockUserRepo.find.mockResolvedValue([{ id: 5, role: Role.MANAGER, isActive: true }]);
      mockDepartmentRepo.save.mockImplementation((d: any) => Promise.resolve(d));
      mockDepartmentManagerRepo.find.mockResolvedValue([{ departmentId: 1, userId: 5 }]);

      await service.update(1, { managerUserIds: [5, 5, 5] } as any);

      // find() để validate user chỉ nên nhận đúng 1 id (đã dedupe), không phải 3
      expect(mockUserRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: expect.anything() } }),
      );
      expect(mockTransactionEntityManager.insert).toHaveBeenCalledWith(DepartmentManager, [
        { departmentId: 1, userId: 5 },
      ]);
    });

    it('KHÔNG truyền managerUserIds vào merge() (đã destructure riêng) - tránh TypeORM merge đè nhầm giá trị đã validate', async () => {
      mockDepartmentRepo.findOne.mockResolvedValueOnce(existingDepartment());
      mockUserRepo.find.mockResolvedValue([{ id: 5, role: Role.MANAGER, isActive: true }]);
      mockDepartmentRepo.save.mockImplementation((d: any) => Promise.resolve(d));
      mockDepartmentManagerRepo.find.mockResolvedValue([{ departmentId: 1, userId: 5 }]);

      await service.update(1, { managerUserIds: [5], name: 'Tên mới' } as any);

      const mergeArg = mockDepartmentRepo.merge.mock.calls[0][1];
      expect(mergeArg).not.toHaveProperty('managerUserIds');
      expect(mergeArg).toEqual(expect.objectContaining({ name: 'Tên mới' }));
    });
  });
});