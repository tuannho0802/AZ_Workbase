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
