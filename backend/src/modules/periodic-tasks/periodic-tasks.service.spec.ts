import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PeriodicTasksService } from './periodic-tasks.service';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { PeriodicTaskStatus } from '../../database/entities/periodic-task-status.entity';
import { User } from '../../database/entities/user.entity';
import { DepartmentManager } from '../../database/entities/department-manager.entity';
import { Role } from '../../common/enums/role.enum';
import { PeriodType } from '../../common/enums/period-type.enum';

function makeFakeQueryBuilder(overrides: { getOne?: any; getManyAndCount?: any } = {}) {
  const qb: any = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(overrides.getOne ?? null),
    getManyAndCount: jest.fn().mockResolvedValue(overrides.getManyAndCount ?? [[], 0]),
  };
  return qb;
}

describe('PeriodicTasksService', () => {
  let service: PeriodicTasksService;

  const mockTaskRepo = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
    softDelete: jest.fn(),
  };
  const mockStatusRepo = {
    findOne: jest.fn(),
  };
  const mockUserRepo = {
    findOne: jest.fn(),
  };
  const mockDepartmentManagerRepo = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodicTasksService,
        { provide: getRepositoryToken(PeriodicTask), useValue: mockTaskRepo },
        { provide: getRepositoryToken(PeriodicTaskStatus), useValue: mockStatusRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(DepartmentManager), useValue: mockDepartmentManagerRepo },
      ],
    }).compile();

    service = module.get<PeriodicTasksService>(PeriodicTasksService);
  });

  describe('create', () => {
    const validDto = {
      title: 'Gọi lại khách',
      periodType: PeriodType.DAILY,
      periodStartDate: '2026-09-14',
      periodEndDate: '2026-09-14',
      primaryAssigneeId: 5,
    };

    it('ném BadRequestException nếu periodEndDate < periodStartDate', async () => {
      await expect(
        service.create({ ...validDto, periodStartDate: '2026-09-14', periodEndDate: '2026-09-10' }, 1),
      ).rejects.toThrow(BadRequestException);
      expect(mockUserRepo.findOne).not.toHaveBeenCalled();
    });

    it('ném BadRequestException nếu primaryAssigneeId không tồn tại/đã bị khoá', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(service.create(validDto, 1)).rejects.toThrow(BadRequestException);
    });

    it('auto-fill departmentId từ phòng ban của primaryAssignee khi không truyền departmentId', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 5, departmentId: 3, isActive: true });
      mockStatusRepo.findOne.mockResolvedValue({ id: 1, code: 'not_started' });
      mockTaskRepo.create.mockImplementation((data) => data);
      mockTaskRepo.save.mockImplementation((data) => Promise.resolve({ id: 100, ...data }));

      const result = await service.create(validDto, 1);

      expect(mockTaskRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ departmentId: 3, statusId: 1, createdById: 1, primaryAssigneeId: 5 }),
      );
      expect(result).toEqual(expect.objectContaining({ id: 100, departmentId: 3 }));
    });

    it('dùng departmentId truyền vào thay vì auto-fill nếu có', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 5, departmentId: 3, isActive: true });
      mockStatusRepo.findOne.mockResolvedValue({ id: 1, code: 'not_started' });
      mockTaskRepo.create.mockImplementation((data) => data);
      mockTaskRepo.save.mockImplementation((data) => Promise.resolve(data));

      await service.create({ ...validDto, departmentId: 9 }, 1);

      expect(mockTaskRepo.create).toHaveBeenCalledWith(expect.objectContaining({ departmentId: 9 }));
    });

    it('ném BadRequestException nếu truyền statusId không tồn tại', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 5, departmentId: 3, isActive: true });
      mockStatusRepo.findOne.mockResolvedValue(null);

      await expect(service.create({ ...validDto, statusId: 999 }, 1)).rejects.toThrow(BadRequestException);
    });

    it('lưu color khi có truyền, mặc định null khi không truyền', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 5, departmentId: 3, isActive: true });
      mockStatusRepo.findOne.mockResolvedValue({ id: 1, code: 'not_started' });
      mockTaskRepo.create.mockImplementation((data) => data);
      mockTaskRepo.save.mockImplementation((data) => Promise.resolve(data));

      await service.create({ ...validDto, color: '#FF5733' }, 1);
      expect(mockTaskRepo.create).toHaveBeenCalledWith(expect.objectContaining({ color: '#FF5733' }));

      await service.create(validDto, 1);
      expect(mockTaskRepo.create).toHaveBeenCalledWith(expect.objectContaining({ color: null }));
    });
  });

  describe('findOne', () => {
    it('ném NotFoundException nếu Task không tồn tại hoặc ngoài phạm vi scope', async () => {
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: null }));

      await expect(service.findOne(999, 1, Role.EMPLOYEE, 'own')).rejects.toThrow(NotFoundException);
    });

    it('trả về Task nếu tìm thấy trong phạm vi scope', async () => {
      const task = { id: 1, title: 'Task A' };
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: task }));

      const result = await service.findOne(1, 1, Role.ADMIN, 'all');

      expect(result).toEqual(task);
    });
  });

  describe('findAll', () => {
    it('trả về danh sách kèm phân trang', async () => {
      const tasks = [{ id: 1 }, { id: 2 }];
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getManyAndCount: [tasks, 2] }));

      const result = await service.findAll({ page: 1, limit: 20 } as any, 1, Role.ADMIN, 'all');

      expect(result).toEqual({ data: tasks, total: 2, page: 1, limit: 20, totalPages: 1 });
    });
  });

  describe('update', () => {
    it('ném NotFoundException nếu Task không tồn tại/ngoài phạm vi scope (qua findOne - "1 cổng gác")', async () => {
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: null }));

      await expect(service.update(999, { title: 'X' }, 1, Role.EMPLOYEE, 'own')).rejects.toThrow(NotFoundException);
    });

    it('sửa tiêu đề/note thành công, gán updatedById', async () => {
      const task: any = {
        id: 1,
        title: 'Old',
        note: null,
        periodStartDate: '2026-09-14',
        periodEndDate: '2026-09-14',
      };
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: task }));
      mockTaskRepo.save.mockImplementation((t) => Promise.resolve(t));

      const result = await service.update(1, { title: 'New title', note: 'ghi chú mới' }, 9, Role.ADMIN, 'all');

      expect(result.title).toBe('New title');
      expect(result.note).toBe('ghi chú mới');
      expect(result.updatedById).toBe(9);
    });

    it('cho phép sửa departmentId tự do (không khoá cứng theo primaryAssignee) - PLAN mục 2.10', async () => {
      const task: any = {
        id: 1,
        departmentId: 3,
        periodStartDate: '2026-09-14',
        periodEndDate: '2026-09-14',
      };
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: task }));
      mockTaskRepo.save.mockImplementation((t) => Promise.resolve(t));

      const result = await service.update(1, { departmentId: 8 }, 9, Role.ADMIN, 'all');

      expect(result.departmentId).toBe(8);
    });

    it('cho phép sửa color tự do, kể cả về null', async () => {
      const task: any = {
        id: 1,
        color: '#000000',
        periodStartDate: '2026-09-14',
        periodEndDate: '2026-09-14',
      };
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: task }));
      mockTaskRepo.save.mockImplementation((t) => Promise.resolve(t));

      const result = await service.update(1, { color: '#FF5733' }, 9, Role.ADMIN, 'all');
      expect(result.color).toBe('#FF5733');
    });

    it('ném BadRequestException nếu sửa statusId thành ID không tồn tại', async () => {
      const task: any = { id: 1, periodStartDate: '2026-09-14', periodEndDate: '2026-09-14' };
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: task }));
      mockStatusRepo.findOne.mockResolvedValue(null);

      await expect(service.update(1, { statusId: 999 }, 9, Role.ADMIN, 'all')).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('ném NotFoundException nếu Task không tồn tại', async () => {
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: null }));

      await expect(service.remove(999, 1, Role.ADMIN)).rejects.toThrow(NotFoundException);
    });

    it('ném ForbiddenException nếu không phải Admin', async () => {
      const task: any = { id: 1, createdById: 1 };
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: task }));

      await expect(service.remove(1, 1, Role.EMPLOYEE)).rejects.toThrow(ForbiddenException);
      expect(mockTaskRepo.softDelete).not.toHaveBeenCalled();
    });

    it('Admin xoá mềm thành công', async () => {
      const task: any = { id: 1, createdById: 1 };
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: task }));
      mockTaskRepo.softDelete.mockResolvedValue(undefined);

      const result = await service.remove(1, 2, Role.ADMIN);

      expect(mockTaskRepo.softDelete).toHaveBeenCalledWith(1);
      expect(result).toEqual({ deleted: true });
    });
  });
});