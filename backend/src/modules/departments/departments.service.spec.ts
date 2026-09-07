import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { Department } from '../../database/entities/department.entity';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../common/enums/role.enum';

describe('DepartmentsService', () => {
  let service: DepartmentsService;

  const mockDepartmentRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    merge: jest.fn(),
  };
  const mockUserRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepartmentsService,
        { provide: getRepositoryToken(Department), useValue: mockDepartmentRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
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

  describe('update - managerUserId (PERMISSIONS.md mục 2.9 - blocker đã fix)', () => {
    const existingDepartment = () => ({ id: 1, name: 'Kinh doanh', managerUserId: null });

    it('ném NotFoundException nếu phòng ban không tồn tại', async () => {
      mockDepartmentRepo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { managerUserId: 5 } as any)).rejects.toThrow(
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

    it('KHÔNG đụng gì tới managerUserId nếu DTO không truyền field này (undefined)', async () => {
      mockDepartmentRepo.findOne.mockResolvedValueOnce(existingDepartment());
      mockDepartmentRepo.save.mockImplementation((d: any) => Promise.resolve(d));

      await service.update(1, { name: 'Tên mới' } as any);

      expect(mockUserRepo.findOne).not.toHaveBeenCalled();
    });

    it('cho phép gỡ Manager (managerUserId = null) mà KHÔNG cần validate user', async () => {
      mockDepartmentRepo.findOne.mockResolvedValueOnce({ ...existingDepartment(), managerUserId: 5 });
      mockDepartmentRepo.save.mockImplementation((d: any) => Promise.resolve(d));

      const result = await service.update(1, { managerUserId: null } as any);

      expect(mockUserRepo.findOne).not.toHaveBeenCalled();
      expect(result.managerUserId).toBeNull();
    });

    it('ném NotFoundException nếu managerUserId trỏ tới user không tồn tại', async () => {
      mockDepartmentRepo.findOne.mockResolvedValueOnce(existingDepartment());
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(service.update(1, { managerUserId: 999 } as any)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockDepartmentRepo.save).not.toHaveBeenCalled();
    });

    it('⚠️ ném BadRequestException nếu user được gán KHÔNG có role MANAGER (vd Employee/Admin) - chặn gán nhầm làm sai lệch phạm vi phân quyền toàn hệ thống', async () => {
      mockDepartmentRepo.findOne.mockResolvedValueOnce(existingDepartment());
      mockUserRepo.findOne.mockResolvedValue({ id: 5, role: Role.EMPLOYEE, isActive: true });

      await expect(service.update(1, { managerUserId: 5 } as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockDepartmentRepo.save).not.toHaveBeenCalled();
    });

    it('⚠️ ném BadRequestException nếu Manager được gán đang bị khoá (isActive=false)', async () => {
      mockDepartmentRepo.findOne.mockResolvedValueOnce(existingDepartment());
      mockUserRepo.findOne.mockResolvedValue({ id: 5, role: Role.MANAGER, isActive: false });

      await expect(service.update(1, { managerUserId: 5 } as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockDepartmentRepo.save).not.toHaveBeenCalled();
    });

    it('gán thành công khi user hợp lệ (role MANAGER, đang active)', async () => {
      mockDepartmentRepo.findOne.mockResolvedValueOnce(existingDepartment());
      mockUserRepo.findOne.mockResolvedValue({ id: 5, role: Role.MANAGER, isActive: true });
      mockDepartmentRepo.save.mockImplementation((d: any) => Promise.resolve(d));

      const result = await service.update(1, { managerUserId: 5 } as any);

      expect(result.managerUserId).toBe(5);
      expect(mockDepartmentRepo.save).toHaveBeenCalled();
    });

    it('KHÔNG truyền managerUserId vào merge() (đã destructure riêng) - tránh TypeORM merge đè nhầm giá trị đã validate', async () => {
      mockDepartmentRepo.findOne.mockResolvedValueOnce(existingDepartment());
      mockUserRepo.findOne.mockResolvedValue({ id: 5, role: Role.MANAGER, isActive: true });
      mockDepartmentRepo.save.mockImplementation((d: any) => Promise.resolve(d));

      await service.update(1, { managerUserId: 5, name: 'Tên mới' } as any);

      const mergeArg = mockDepartmentRepo.merge.mock.calls[0][1];
      expect(mergeArg).not.toHaveProperty('managerUserId');
      expect(mergeArg).toEqual(expect.objectContaining({ name: 'Tên mới' }));
    });
  });
});