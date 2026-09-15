import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PeriodicTasksService } from './periodic-tasks.service';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { PeriodicTaskStatus } from '../../database/entities/periodic-task-status.entity';
import { User } from '../../database/entities/user.entity';
import { Department } from '../../database/entities/department.entity';
import { DepartmentManager } from '../../database/entities/department-manager.entity';
import { PermissionsService } from '../permissions/permissions.service';
import { PeriodicTaskAuditService, PeriodicTaskAuditAction } from './periodic-task-audit.service';
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
  const mockDepartmentRepo = {
    findOne: jest.fn(),
  };
  const mockDepartmentManagerRepo = {
    find: jest.fn(),
  };
  const mockPermissionsService = {
    hasPermission: jest.fn(),
  };
  const mockAuditService = {
    logActionAsync: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodicTasksService,
        { provide: getRepositoryToken(PeriodicTask), useValue: mockTaskRepo },
        { provide: getRepositoryToken(PeriodicTaskStatus), useValue: mockStatusRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Department), useValue: mockDepartmentRepo },
        { provide: getRepositoryToken(DepartmentManager), useValue: mockDepartmentManagerRepo },
        { provide: PermissionsService, useValue: mockPermissionsService },
        { provide: PeriodicTaskAuditService, useValue: mockAuditService },
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
      mockStatusRepo.findOne.mockResolvedValue({ id: 1, code: 'not_started', name: 'Chưa bắt đầu' });
      mockDepartmentRepo.findOne.mockResolvedValue({ id: 3, name: 'Sales' });
      mockTaskRepo.create.mockImplementation((data) => data);
      mockTaskRepo.save.mockImplementation((data) => Promise.resolve({ id: 100, ...data }));

      const result = await service.create(validDto, 1);

      expect(mockTaskRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ departmentId: 3, statusId: 1, createdById: 1, primaryAssigneeId: 5 }),
      );
      expect(result).toEqual(expect.objectContaining({ id: 100, departmentId: 3 }));
      // Phase 7 (PLAN mục 2.6): audit log `created` phải ghi ĐÚNG id thật
      // (result.id) - không phải id tạm trước khi save.
      // ⚠️ CẢI TIẾN AUDIT LOG (2026-09): `newData` giờ là snapshot ĐỌC ĐƯỢC
      // (`buildAuditSnapshot()`) - object `status`/`primaryAssignee`/
      // `department` mang tên/màu thật, KHÔNG còn log thẳng `result` (raw
      // entity chỉ có `statusId`/`primaryAssigneeId`/`departmentId` số).
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        100,
        1,
        PeriodicTaskAuditAction.CREATED,
        null,
        expect.objectContaining({
          title: 'Gọi lại khách',
          status: expect.objectContaining({ id: 1, code: 'not_started', name: 'Chưa bắt đầu' }),
          primaryAssignee: expect.objectContaining({ id: 5 }),
          department: expect.objectContaining({ id: 3, name: 'Sales' }),
        }),
      );
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

      await expect(service.update(999, { title: 'X' }, { id: 1, role: Role.EMPLOYEE }, 'own')).rejects.toThrow(NotFoundException);
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

      const result = await service.update(1, { title: 'New title', note: 'ghi chú mới' }, { id: 9, role: Role.ADMIN }, 'all');

      expect(result.title).toBe('New title');
      expect(result.note).toBe('ghi chú mới');
      expect(result.updatedById).toBe(9);
      // Phase 7: action `updated` chung luôn ghi, KHÔNG kèm `status_changed`/
      // `primary_assignee_changed` vì 2 field đó không đổi ở test này.
      // ⚠️ `before`/`after` giờ là snapshot đọc được (buildAuditSnapshot) -
      // chỉ cần khớp field liên quan, không cần liệt kê toàn bộ shape.
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1,
        9,
        PeriodicTaskAuditAction.UPDATED,
        expect.objectContaining({ title: 'Old' }),
        expect.objectContaining({ title: 'New title', note: 'ghi chú mới' }),
      );
      expect(mockAuditService.logActionAsync).not.toHaveBeenCalledWith(
        1,
        9,
        PeriodicTaskAuditAction.STATUS_CHANGED,
        expect.anything(),
        expect.anything(),
      );
    });

    it('đổi statusId ghi THÊM audit log status_changed (PLAN mục 2.6)', async () => {
      const task: any = {
        id: 1,
        statusId: 1,
        periodStartDate: '2026-09-14',
        periodEndDate: '2026-09-14',
      };
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: task }));
      mockTaskRepo.save.mockImplementation((t) => Promise.resolve(t));
      mockStatusRepo.findOne.mockResolvedValue({ id: 2 });

      await service.update(1, { statusId: 2 }, { id: 9, role: Role.ADMIN }, 'all');

      // ⚠️ `{ statusId }` (số thô) → `{ status: {...} }` (object đọc được) -
      // xem JSDoc `buildAuditSnapshot`. Task mock không có `.status` load
      // sẵn nên "before" là `null`, "after" resolve full entity mock trả về.
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1,
        9,
        PeriodicTaskAuditAction.STATUS_CHANGED,
        { status: null },
        { status: expect.objectContaining({ id: 2 }) },
      );
    });

    it('BUG THẬT (2026-09-15, Kanban kéo-thả không đổi cột): đổi statusId phải set LUÔN relation `status` khớp cột FK, không chỉ đổi `statusId` - nếu không TypeORM ưu tiên relation cũ đã load từ findOne() khi save(), khiến DB không đổi thật dù response trả 200 (xem SKILL_NESTJS_BACKEND.md mục 13)', async () => {
      const task: any = {
        id: 1,
        statusId: 1,
        status: { id: 1, code: 'not_started' }, // relation ĐÃ load qua leftJoinAndSelect ở findOne()
        primaryAssigneeId: 5,
        primaryAssignee: { id: 5 },
        periodStartDate: '2026-09-14',
        periodEndDate: '2026-09-14',
      };
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: task }));
      let savedArg: any;
      mockTaskRepo.save.mockImplementation((t) => {
        savedArg = t;
        return Promise.resolve(t);
      });
      mockStatusRepo.findOne.mockResolvedValue({ id: 2 });

      await service.update(1, { statusId: 2 }, { id: 9, role: Role.ADMIN }, 'all');

      // Entity truyền vào save() phải có relation `status`/`primaryAssignee`/
      // `updatedBy` khớp ĐÚNG với id vừa đổi (không còn giữ object cũ).
      expect(savedArg.status).toEqual({ id: 2 });
      expect(savedArg.primaryAssignee).toEqual({ id: 5 });
      expect(savedArg.updatedBy).toEqual({ id: 9 });
    });

    it('đổi primaryAssigneeId ghi THÊM audit log primary_assignee_changed (PLAN mục 2.6)', async () => {
      const task: any = {
        id: 1,
        primaryAssigneeId: 5,
        periodStartDate: '2026-09-14',
        periodEndDate: '2026-09-14',
      };
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: task }));
      mockTaskRepo.save.mockImplementation((t) => Promise.resolve(t));
      mockUserRepo.findOne.mockResolvedValue({ id: 7, isActive: true });

      await service.update(1, { primaryAssigneeId: 7 }, { id: 9, role: Role.ADMIN }, 'all');

      // ⚠️ `{ primaryAssigneeId }` (số thô) → `{ primaryAssignee: {...} }`
      // (object đọc được) - cùng lý do đã sửa ở `status_changed` bên trên.
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1,
        9,
        PeriodicTaskAuditAction.PRIMARY_ASSIGNEE_CHANGED,
        { primaryAssignee: null },
        { primaryAssignee: expect.objectContaining({ id: 7 }) },
      );
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

      const result = await service.update(1, { departmentId: 8 }, { id: 9, role: Role.ADMIN }, 'all');

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

      const result = await service.update(1, { color: '#FF5733' }, { id: 9, role: Role.ADMIN }, 'all');
      expect(result.color).toBe('#FF5733');
    });

    it('ném BadRequestException nếu sửa statusId thành ID không tồn tại', async () => {
      const task: any = { id: 1, periodStartDate: '2026-09-14', periodEndDate: '2026-09-14' };
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: task }));
      mockStatusRepo.findOne.mockResolvedValue(null);

      await expect(service.update(1, { statusId: 999 }, { id: 9, role: Role.ADMIN }, 'all')).rejects.toThrow(BadRequestException);
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
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1,
        2,
        PeriodicTaskAuditAction.DELETED,
        task,
        null,
      );
    });
  });

  describe('lock', () => {
    it('khoá Task thành công và ghi audit log locked (PLAN mục 2.9, 2.6)', async () => {
      const task: any = { id: 1, isLocked: false };
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: task }));
      mockTaskRepo.save.mockImplementation((t) => Promise.resolve(t));

      const result = await service.lock(1, { lockNote: 'Đã chốt' }, { id: 9, role: Role.ADMIN }, 'all');

      expect(result.isLocked).toBe(true);
      expect(result.lockedById).toBe(9);
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1,
        9,
        PeriodicTaskAuditAction.LOCKED,
        null,
        { lockNote: 'Đã chốt', lockedById: 9 },
      );
    });

    it('gọi lại lock() trên Task đã khoá vẫn ghi audit log mới (idempotent, không lỗi)', async () => {
      const task: any = { id: 1, isLocked: true, lockedById: 1, lockNote: 'Cũ' };
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: task }));
      mockTaskRepo.save.mockImplementation((t) => Promise.resolve(t));

      await expect(
        service.lock(1, { lockNote: 'Mới' }, { id: 9, role: Role.ADMIN }, 'all'),
      ).resolves.toEqual(expect.objectContaining({ lockNote: 'Mới' }));
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1,
        9,
        PeriodicTaskAuditAction.LOCKED,
        null,
        { lockNote: 'Mới', lockedById: 9 },
      );
    });
  });

  describe('unlock', () => {
    it('mở khoá Task thành công và ghi audit log unlocked (PLAN mục 2.9, 2.6)', async () => {
      const task: any = { id: 1, isLocked: true, lockedById: 9, lockedAt: new Date(), lockNote: 'x' };
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: task }));
      mockTaskRepo.save.mockImplementation((t) => Promise.resolve(t));

      const result = await service.unlock(1, { id: 9, role: Role.ADMIN }, 'all');

      expect(result.isLocked).toBe(false);
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1,
        9,
        PeriodicTaskAuditAction.UNLOCKED,
        null,
        null,
      );
    });
  });
});