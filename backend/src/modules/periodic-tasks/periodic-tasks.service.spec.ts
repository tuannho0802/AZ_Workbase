import * as dateVnUtil from '../../common/utils/date-vn.util';
import { AUTO_LOCK_NOTE } from './helpers/overdue.helper';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PeriodicTasksService } from './periodic-tasks.service';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { PeriodicTaskStatus } from '../../database/entities/periodic-task-status.entity';
import { PeriodicTaskSecondaryAssignee } from '../../database/entities/periodic-task-secondary-assignee.entity';
import { PeriodicTaskChecklistItem } from '../../database/entities/periodic-task-checklist-item.entity';
import { User } from '../../database/entities/user.entity';
import { Department } from '../../database/entities/department.entity';
import { DepartmentManager } from '../../database/entities/department-manager.entity';
import { PermissionsService } from '../permissions/permissions.service';
import { PeriodicTaskAuditService, PeriodicTaskAuditAction } from './periodic-task-audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role } from '../../common/enums/role.enum';
import { PeriodType } from '../../common/enums/period-type.enum';

function makeFakeQueryBuilder(overrides: { getOne?: any; getManyAndCount?: any; getMany?: any; getCount?: any; getRawOne?: any } = {}) {
  const qb: any = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(overrides.getOne ?? null),
    getRawOne: jest.fn().mockResolvedValue(overrides.getRawOne ?? null),
    getManyAndCount: jest.fn().mockResolvedValue(overrides.getManyAndCount ?? [[], 0]),
    // findAll() dùng getMany + (có điều kiện) getCount; mặc định suy từ getManyAndCount để spec cũ giữ nguyên.
    getMany: jest.fn().mockResolvedValue(overrides.getMany ?? (overrides.getManyAndCount ?? [[], 0])[0]),
    getCount: jest.fn().mockResolvedValue(overrides.getCount ?? (overrides.getManyAndCount ?? [[], 0])[1]),
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
  // Notification Phase 2: repo CHỈ dùng để đọc `secondaryAssigneeIds` (xem
  // `getSecondaryAssigneeIds()`) - mock rỗng mặc định, không ảnh hưởng các
  // test nghiệp vụ chính vốn không quan tâm tới thông báo.
  const mockSecondaryAssigneeRepo = {
    find: jest.fn(),
  };
  // Guard đổi status <-> checklist: `createQueryBuilder().getRawOne()` trả { total, done }; `update()` tick hàng loạt.
  const mockChecklistQb: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
  };
  const mockChecklistRepo = {
    createQueryBuilder: jest.fn(),
    update: jest.fn(),
  };
  const mockPermissionsService = {
    hasPermission: jest.fn(),
  };
  const mockAuditService = {
    logActionAsync: jest.fn(),
  };
  // Mặc định TẮT (mirror behaviour thật khi biến môi trường
  // NOTIFICATIONS_ENABLED chưa set trong môi trường test) - `emit()`/
  // `notifyTaskSafely()` tự no-op, các test nghiệp vụ chính không cần quan
  // tâm gì thêm. Bật `true` riêng ở từng test muốn khoá hành vi emit.
  const mockNotificationsService = {
    isEnabled: jest.fn().mockReturnValue(false),
    emit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockNotificationsService.isEnabled.mockReturnValue(false);
    mockSecondaryAssigneeRepo.find.mockResolvedValue([]);
    mockChecklistRepo.createQueryBuilder.mockReturnValue(mockChecklistQb);
    mockChecklistQb.getRawOne.mockResolvedValue({ total: 0, done: 0 }); // mặc định: Task không có checklist
    mockChecklistRepo.update.mockResolvedValue({ affected: 0 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodicTasksService,
        { provide: getRepositoryToken(PeriodicTask), useValue: mockTaskRepo },
        { provide: getRepositoryToken(PeriodicTaskStatus), useValue: mockStatusRepo },
        { provide: getRepositoryToken(PeriodicTaskSecondaryAssignee), useValue: mockSecondaryAssigneeRepo },
        { provide: getRepositoryToken(PeriodicTaskChecklistItem), useValue: mockChecklistRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Department), useValue: mockDepartmentRepo },
        { provide: getRepositoryToken(DepartmentManager), useValue: mockDepartmentManagerRepo },
        { provide: PermissionsService, useValue: mockPermissionsService },
        { provide: PeriodicTaskAuditService, useValue: mockAuditService },
        { provide: NotificationsService, useValue: mockNotificationsService },
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

  describe('findForChecklist (bản nhẹ cho thao tác ghi checklist)', () => {
    it('chỉ join status, KHÔNG join/hydrate primaryAssignee/department/createdBy/updatedBy', async () => {
      const task = { id: 1, title: 'A', isLocked: false, status: { code: 'in_progress' } };
      const qb = makeFakeQueryBuilder({ getOne: task });
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findForChecklist(1, 1, Role.EMPLOYEE, 'own');

      expect(result).toEqual(task);
      expect(qb.leftJoin).toHaveBeenCalledTimes(1);
      expect(qb.leftJoin).toHaveBeenCalledWith('task.status', 'status');
      expect(qb.leftJoinAndSelect).not.toHaveBeenCalled();
      expect(qb.select).toHaveBeenCalledWith(expect.arrayContaining(['task.id', 'task.isLocked', 'task.periodEndDate']));
    });

    it('áp scope như findOne: ngoài phạm vi -> NotFoundException', async () => {
      const qb = makeFakeQueryBuilder({ getOne: null });
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.findForChecklist(999, 1, Role.EMPLOYEE, 'own')).rejects.toThrow(NotFoundException);
      // nhánh own của applyViewFilter phải được thêm vào WHERE
      expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('primaryAssigneeId'), expect.any(Object));
    });
  });

  describe('getChecklistSummaryForView (gác xem + đếm checklist 1 truy vấn)', () => {
    it('trả total/done (ép số) khi Task nằm trong phạm vi', async () => {
      const qb = makeFakeQueryBuilder({ getRawOne: { found: '1', total: '23', done: '7' } });
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.getChecklistSummaryForView(1, 1, Role.ADMIN, 'all')).resolves.toEqual({ total: 23, done: 7 });
    });

    it('Task có mặt nhưng chưa có item -> total 0, done 0 (SUM trả null)', async () => {
      const qb = makeFakeQueryBuilder({ getRawOne: { found: 1, total: 0, done: null } });
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.getChecklistSummaryForView(1, 1, Role.ADMIN, 'all')).resolves.toEqual({ total: 0, done: 0 });
    });

    it('found = 0 (không tồn tại / đã xoá / ngoài scope) -> NotFoundException', async () => {
      const qb = makeFakeQueryBuilder({ getRawOne: { found: '0', total: '0', done: null } });
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.getChecklistSummaryForView(999, 1, Role.EMPLOYEE, 'own')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    const TODAY = new Date('2026-09-24T05:00:00Z'); // Thứ Năm -> tuần này 2026-09-21 .. 2026-09-27

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(TODAY);
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('trả về danh sách kèm phân trang + khoảng ngày đã áp', async () => {
      const tasks = [{ id: 1 }, { id: 2 }];
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getManyAndCount: [tasks, 2] }));

      const result = await service.findAll({ page: 1, limit: 20 } as any, 1, Role.ADMIN, 'all');

      expect(result).toEqual({
        data: tasks, total: 2, page: 1, limit: 20, totalPages: 1,
        dateFrom: '2026-09-21', dateTo: '2026-09-27',
      });
    });

    it('[PERF] danh sách chỉ select id+name của 3 quan hệ User (không kéo cả entity User)', async () => {
      const qb = makeFakeQueryBuilder({ getMany: [{ id: 1 }] });
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ page: 1, limit: 20 } as any, 1, Role.ADMIN, 'all');

      const joinedAndSelected = qb.leftJoinAndSelect.mock.calls.map((c: any[]) => c[1]);
      expect(joinedAndSelected).toEqual(['status', 'department']);
      expect(qb.leftJoin.mock.calls.map((c: any[]) => c[1])).toEqual(['primaryAssignee', 'createdBy', 'updatedBy']);
      expect(qb.addSelect).toHaveBeenCalledWith([
        'primaryAssignee.id', 'primaryAssignee.name',
        'createdBy.id', 'createdBy.name',
        'updatedBy.id', 'updatedBy.name',
      ]);
    });

    it('[PERF 3B.4] trang chưa đầy (rows < limit) -> total suy ra, KHÔNG chạy COUNT', async () => {
      const qb = makeFakeQueryBuilder({ getMany: [{ id: 1 }, { id: 2 }, { id: 3 }] });
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      const r = await service.findAll({ page: 2, limit: 5 } as any, 1, Role.ADMIN, 'all');

      expect(r.total).toBe(5 + 3);
      expect(r.totalPages).toBe(2);
      expect(qb.getCount).not.toHaveBeenCalled();
    });

    it('[PERF 3B.4] trang rỗng ở page 1 -> total = 0, KHÔNG chạy COUNT', async () => {
      const qb = makeFakeQueryBuilder({ getMany: [] });
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      const r = await service.findAll({ page: 1, limit: 20 } as any, 1, Role.ADMIN, 'all');

      expect(r.total).toBe(0);
      expect(qb.getCount).not.toHaveBeenCalled();
    });

    it('[PERF] COUNT dùng truy vấn NHẸ (không join), cùng điều kiện lọc với truy vấn dữ liệu', async () => {
      const dataQb = makeFakeQueryBuilder({ getMany: [{ id: 1 }, { id: 2 }] });
      const countQb = makeFakeQueryBuilder({ getCount: 37 });
      mockTaskRepo.createQueryBuilder.mockReturnValueOnce(dataQb).mockReturnValueOnce(countQb);

      const r = await service.findAll({ page: 1, limit: 2, statusId: 4, search: 'abc' } as any, 1, Role.ADMIN, 'all');

      expect(r.total).toBe(37);
      expect(countQb.getCount).toHaveBeenCalledTimes(1);
      expect(countQb.leftJoin).not.toHaveBeenCalled();
      expect(countQb.leftJoinAndSelect).not.toHaveBeenCalled();
      // CÙNG bộ lọc ở cả 2 truy vấn (chống lệch total so với data)
      const conds = (qb: any) => qb.andWhere.mock.calls.map((c: any[]) => c[0]).sort();
      expect(conds(countQb)).toEqual(conds(dataQb));
    });

    it('[PERF] COUNT chỉ join `status` khi lọc overdueOnly (điều kiện cần alias status)', async () => {
      const dataQb = makeFakeQueryBuilder({ getMany: [{ id: 1 }, { id: 2 }] });
      const countQb = makeFakeQueryBuilder({ getCount: 9 });
      mockTaskRepo.createQueryBuilder.mockReturnValueOnce(dataQb).mockReturnValueOnce(countQb);

      await service.findAll({ page: 1, limit: 2, overdueOnly: true } as any, 1, Role.ADMIN, 'all');

      expect(countQb.leftJoin.mock.calls.map((c: any[]) => c[1])).toEqual(['status']);
    });

    it('[PERF 3B.4] trang đầy (rows == limit) -> PHẢI chạy COUNT để biết tổng', async () => {
      const qb = makeFakeQueryBuilder({ getMany: [{ id: 1 }, { id: 2 }], getCount: 37 });
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      const r = await service.findAll({ page: 1, limit: 2 } as any, 1, Role.ADMIN, 'all');

      expect(r.total).toBe(37);
      expect(r.totalPages).toBe(19);
      expect(qb.getCount).toHaveBeenCalledTimes(1);
    });

    it('[PERF 3B.4] trang rỗng ở page > 1 (vượt trang cuối) -> chạy COUNT', async () => {
      const qb = makeFakeQueryBuilder({ getMany: [], getCount: 10 });
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      const r = await service.findAll({ page: 9, limit: 5 } as any, 1, Role.ADMIN, 'all');

      expect(r.total).toBe(10);
      expect(qb.getCount).toHaveBeenCalledTimes(1);
    });

    it('KHÔNG truyền ngày -> BẮT BUỘC lọc Tuần này (không bao giờ tải toàn bộ)', async () => {
      const qb = makeFakeQueryBuilder();
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({} as any, 1, Role.ADMIN, 'all');

      expect(qb.andWhere).toHaveBeenCalledWith('task.periodEndDate >= :dateFrom', { dateFrom: '2026-09-21' });
      expect(qb.andWhere).toHaveBeenCalledWith('task.periodStartDate <= :dateTo', { dateTo: '2026-09-27' });
    });

    it('truyền khoảng riêng -> dùng khoảng đó, không ghi đè bằng Tuần này', async () => {
      const qb = makeFakeQueryBuilder();
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ dateFrom: '2026-09-01', dateTo: '2026-09-30' } as any, 1, Role.ADMIN, 'all');

      expect(qb.andWhere).toHaveBeenCalledWith('task.periodEndDate >= :dateFrom', { dateFrom: '2026-09-01' });
      expect(qb.andWhere).toHaveBeenCalledWith('task.periodStartDate <= :dateTo', { dateTo: '2026-09-30' });
    });

    it('khoảng vượt giới hạn -> 400 và KHÔNG chạy truy vấn', async () => {
      const qb = makeFakeQueryBuilder();
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.findAll({ dateFrom: '2026-01-01', dateTo: '2026-12-31' } as any, 1, Role.ADMIN, 'all'),
      ).rejects.toThrow(BadRequestException);
      expect(qb.getMany).not.toHaveBeenCalled();
    });

    it('assigneeId -> lọc Phụ trách CHÍNH hoặc PHỤ', async () => {
      const qb = makeFakeQueryBuilder();
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ assigneeId: 7 } as any, 1, Role.ADMIN, 'all');

      const call = qb.andWhere.mock.calls.find(([sql]: [string]) => sql.includes('periodic_task_secondary_assignees'));
      expect(call).toBeDefined();
      expect(call[0]).toContain('task.primaryAssigneeId = :filterAssigneeId');
      expect(call[1]).toEqual({ filterAssigneeId: 7 });
    });

    it('overdueOnly=true -> lọc đủ 3 ngày sau hạn kỳ (hoặc có dấu + đã qua hạn) + loại task đã xong', async () => {
      jest.spyOn(dateVnUtil, 'todayVnStr').mockReturnValue('2026-10-06');
      const qb = makeFakeQueryBuilder();
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ overdueOnly: true } as any, 1, Role.ADMIN, 'all');

      const calls = qb.andWhere.mock.calls as any[][];
      const dateCall = calls.find(([sql]) => String(sql).includes(':overdueCutoff'));
      expect(dateCall?.[0]).toContain('task.overdueMarkedAt IS NOT NULL');
      expect(dateCall?.[1]).toEqual({ overdueCutoff: '2026-10-03', overdueToday: '2026-10-06' });
      const codeCall = calls.find(([sql]) => String(sql).includes('status.code NOT IN'));
      expect(codeCall?.[1]).toEqual({ overdueDoneCodes: ['in_review', 'done', 'completed'] });
      const doneStateCall = calls.find(([sql]) => String(sql).includes('status.isDoneState'));
      expect(doneStateCall?.[1]).toEqual({ overdueNotDone: 0 });
      jest.restoreAllMocks();
    });

    it('không truyền overdueOnly -> KHÔNG thêm điều kiện quá hạn', async () => {
      const qb = makeFakeQueryBuilder();
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);
      await service.findAll({} as any, 1, Role.ADMIN, 'all');
      expect((qb.andWhere.mock.calls as any[][]).some(([sql]) => String(sql).includes(':overdueCutoff'))).toBe(false);
    });

    it('secondaryAssigneeId -> chỉ lọc Phụ trách PHỤ (không dính Phụ trách chính)', async () => {
      const qb = makeFakeQueryBuilder();
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ secondaryAssigneeId: 9 } as any, 1, Role.ADMIN, 'all');

      const call = qb.andWhere.mock.calls.find(([sql]: [string]) => sql.includes('filterSecondaryAssigneeId'));
      expect(call).toBeDefined();
      expect(call[0]).toContain('periodic_task_secondary_assignees');
      expect(call[0]).not.toContain('primaryAssigneeId');
      expect(call[1]).toEqual({ filterSecondaryAssigneeId: 9 });
    });

    it('primaryAssigneeId + secondaryAssigneeId -> AND cả 2 điều kiện', async () => {
      const qb = makeFakeQueryBuilder();
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ primaryAssigneeId: 3, secondaryAssigneeId: 9 } as any, 1, Role.ADMIN, 'all');

      const sqls = qb.andWhere.mock.calls.map(([sql]: [string]) => sql);
      expect(sqls).toContain('task.primaryAssigneeId = :primaryAssigneeId');
      expect(sqls.some((s: string) => s.includes('filterSecondaryAssigneeId'))).toBe(true);
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

    it('kéo dài kỳ tới tương lai -> tự mở KHOÁ TỰ ĐỘNG (locked_by null + AUTO_LOCK_NOTE) và gỡ dấu quá hạn', async () => {
      const task: any = {
        id: 1,
        periodStartDate: '2026-09-01',
        periodEndDate: '2026-09-10',
        isLocked: true,
        lockedById: null,
        lockedAt: new Date(),
        lockNote: AUTO_LOCK_NOTE,
        overdueMarkedAt: new Date(),
        overdueMarkedById: null,
      };
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: task }));
      mockTaskRepo.save.mockImplementation((t) => Promise.resolve(t));
      // Task đang khoá -> người sửa cần `periodic_tasks.edit_locked`.
      mockPermissionsService.hasPermission.mockResolvedValue({ allowed: true, scope: 'all' });

      const result = await service.update(1, { periodEndDate: '2999-01-01' }, { id: 9, role: Role.ADMIN }, 'all');

      expect(result.isLocked).toBe(false);
      expect(result.lockNote).toBeNull();
      expect(result.overdueMarkedAt).toBeNull();
    });

    it('kéo dài kỳ KHÔNG mở khoá THỦ CÔNG (có lockedById)', async () => {
      const task: any = {
        id: 1,
        periodStartDate: '2026-09-01',
        periodEndDate: '2026-09-10',
        isLocked: true,
        lockedById: 5,
        lockNote: 'Khoá tay',
      };
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: task }));
      mockTaskRepo.save.mockImplementation((t) => Promise.resolve(t));
      // Task đang khoá -> người sửa cần `periodic_tasks.edit_locked`.
      mockPermissionsService.hasPermission.mockResolvedValue({ allowed: true, scope: 'all' });

      const result = await service.update(1, { periodEndDate: '2999-01-01' }, { id: 9, role: Role.ADMIN }, 'all');

      expect(result.isLocked).toBe(true);
      expect(result.lockNote).toBe('Khoá tay');
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

    describe('Guard đổi status <-> checklist', () => {
      const admin = { id: 9, role: Role.ADMIN };
      const makeTask = (code: string) => ({
        id: 1,
        statusId: 1,
        status: { id: 1, code },
        periodStartDate: '2026-09-14',
        periodEndDate: '2026-09-14',
      });
      const setup = (code: string, target: any, checklist: { total: number; done: number }) => {
        const task: any = makeTask(code);
        mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: task }));
        mockTaskRepo.save.mockImplementation((t) => Promise.resolve(t));
        mockStatusRepo.findOne.mockResolvedValue(target);
        mockChecklistQb.getRawOne.mockResolvedValue(checklist);
        return task;
      };

      it('sang Hoàn thành khi còn checklist chưa tick, CHƯA xác nhận -> 409 CHECKLIST_GUARD, KHÔNG đổi status/KHÔNG tick', async () => {
        const task = setup('in_progress', { id: 4, code: 'done', name: 'Hoàn thành' }, { total: 5, done: 3 });

        const err: any = await service.update(1, { statusId: 4 }, admin, 'all').catch((e) => e);

        expect(err).toBeInstanceOf(ConflictException);
        expect(err.getResponse()).toEqual(
          expect.objectContaining({ code: 'CHECKLIST_GUARD', guard: 'complete', sync: 'tick_all', total: 5, done: 3 }),
        );
        expect(task.statusId).toBe(1);
        expect(mockTaskRepo.save).not.toHaveBeenCalled();
        expect(mockChecklistRepo.update).not.toHaveBeenCalled();
      });

      it('đã xác nhận (checklistSync=tick_all) -> tick hết item chưa xong + đổi status + ghi audit checklist_items_synced', async () => {
        setup('in_progress', { id: 4, code: 'done', name: 'Hoàn thành' }, { total: 5, done: 3 });

        const result = await service.update(1, { statusId: 4, checklistSync: 'tick_all' }, admin, 'all');

        expect(mockChecklistRepo.update).toHaveBeenCalledWith({ taskId: 1, isDone: false }, { isDone: true });
        expect(result.statusId).toBe(4);
        expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
          1,
          9,
          PeriodicTaskAuditAction.CHECKLIST_ITEMS_SYNCED,
          { total: 5, done: 3 },
          expect.objectContaining({ done: 5, sync: 'tick_all' }),
        );
      });

      it('checklistSync SAI chiều (untick_all khi cần tick_all) -> vẫn 409, không tick', async () => {
        setup('in_progress', { id: 4, code: 'done', name: 'Hoàn thành' }, { total: 2, done: 0 });

        await expect(service.update(1, { statusId: 4, checklistSync: 'untick_all' }, admin, 'all')).rejects.toThrow(
          ConflictException,
        );
        expect(mockChecklistRepo.update).not.toHaveBeenCalled();
      });

      it('tick đủ rồi -> sang Hoàn thành không hỏi', async () => {
        setup('in_progress', { id: 4, code: 'done', name: 'Hoàn thành' }, { total: 3, done: 3 });

        const result = await service.update(1, { statusId: 4 }, admin, 'all');

        expect(result.statusId).toBe(4);
        expect(mockChecklistRepo.update).not.toHaveBeenCalled();
      });

      it('về To-do khi đã tick -> 409 reset; xác nhận (untick_all) -> bỏ tick hết', async () => {
        setup('in_progress', { id: 2, code: 'not_started', name: 'To-do' }, { total: 4, done: 2 });
        const err: any = await service.update(1, { statusId: 2 }, admin, 'all').catch((e) => e);
        expect(err).toBeInstanceOf(ConflictException);
        expect(err.getResponse()).toEqual(expect.objectContaining({ guard: 'reset', sync: 'untick_all', done: 2 }));

        setup('in_progress', { id: 2, code: 'not_started', name: 'To-do' }, { total: 4, done: 2 });
        await service.update(1, { statusId: 2, checklistSync: 'untick_all' }, admin, 'all');
        expect(mockChecklistRepo.update).toHaveBeenCalledWith({ taskId: 1, isDone: true }, { isDone: false });
      });

      it('sang Đang làm -> không Guard, không đếm checklist', async () => {
        setup('done', { id: 3, code: 'in_progress', name: 'Đang làm' }, { total: 4, done: 4 });

        await service.update(1, { statusId: 3 }, admin, 'all');

        expect(mockChecklistRepo.createQueryBuilder).toHaveBeenCalled(); // có đếm nhưng guard=null
        expect(mockChecklistRepo.update).not.toHaveBeenCalled();
      });

      it('PATCH không đổi status (form sửa gửi lại statusId cũ) -> không Guard', async () => {
        setup('in_progress', { id: 1, code: 'in_progress', name: 'Đang làm' }, { total: 5, done: 1 });

        await service.update(1, { statusId: 1, title: 'Đổi tên' }, admin, 'all');

        expect(mockChecklistRepo.createQueryBuilder).not.toHaveBeenCalled();
      });

      it('changeStatusByCode (luồng tick/thêm checklist) BỎ QUA Guard dù còn item chưa tick', async () => {
        const task = setup('in_progress', { id: 5, code: 'in_review', name: 'Xem xét' }, { total: 5, done: 4 });

        await service.changeStatusByCode(task, 'in_review', admin, 'all');

        expect(mockChecklistRepo.createQueryBuilder).not.toHaveBeenCalled();
        expect(mockChecklistRepo.update).not.toHaveBeenCalled();
      });
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

    it('scope=own: ném ForbiddenException nếu Task không phải do mình tạo/phụ trách chính', async () => {
      const task: any = { id: 1, createdById: 9, primaryAssigneeId: 8 };
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: task }));

      await expect(service.remove(1, 1, Role.EMPLOYEE, 'own')).rejects.toThrow(ForbiddenException);
      expect(mockTaskRepo.softDelete).not.toHaveBeenCalled();
    });

    it('scope=own: Employee xoá được Task do chính mình tạo', async () => {
      const task: any = { id: 1, createdById: 1, primaryAssigneeId: 5 };
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: task }));
      mockTaskRepo.softDelete.mockResolvedValue(undefined);

      await expect(service.remove(1, 1, Role.EMPLOYEE, 'own')).resolves.toEqual({ deleted: true });
      expect(mockTaskRepo.softDelete).toHaveBeenCalledWith(1);
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
        {
          title: undefined,
          description: undefined,
          periodType: undefined,
          periodStartDate: undefined,
          periodEndDate: undefined,
          status: null,
          primaryAssignee: null,
          department: null,
          color: undefined,
          isLocked: undefined,
          lockNote: undefined,
          note: undefined,
        },
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
        { lockNote: 'Đã chốt' },
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
        { lockNote: 'Mới' },
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
  describe('markOverdue / unmarkOverdue (đánh dấu Quá hạn thủ công)', () => {
    const admin = { id: 9, role: Role.ADMIN };
    const mockFind = (task: any) => {
      mockTaskRepo.createQueryBuilder.mockReturnValue(makeFakeQueryBuilder({ getOne: task }));
      mockTaskRepo.save.mockImplementation((t) => Promise.resolve(t));
    };

    it('đánh dấu thành công khi đã qua period_end_date + ghi audit overdue_marked', async () => {
      mockFind({ id: 1, periodEndDate: '2000-01-01', status: { code: 'in_progress' }, overdueMarkedAt: null });

      const result = await service.markOverdue(1, admin, 'all');

      expect(result.overdueMarkedAt).toBeInstanceOf(Date);
      expect(result.overdueMarkedById).toBe(9);
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1,
        9,
        PeriodicTaskAuditAction.OVERDUE_MARKED,
        null,
        { periodEndDate: '2000-01-01' },
      );
    });

    it('từ chối (400) khi Task CHƯA qua hạn kỳ', async () => {
      mockFind({ id: 1, periodEndDate: '2999-12-31', status: { code: 'in_progress' } });
      await expect(service.markOverdue(1, admin, 'all')).rejects.toThrow(BadRequestException);
      expect(mockTaskRepo.save).not.toHaveBeenCalled();
    });

    it('từ chối (400) khi Task đã in_review/done', async () => {
      mockFind({ id: 1, periodEndDate: '2000-01-01', status: { code: 'done' } });
      await expect(service.markOverdue(1, admin, 'all')).rejects.toThrow(BadRequestException);
    });

    it('gỡ dấu: xoá overdueMarkedAt/By + ghi audit overdue_unmarked; chưa đánh dấu thì bỏ qua (idempotent)', async () => {
      mockFind({ id: 1, periodEndDate: '2000-01-01', overdueMarkedAt: new Date(), overdueMarkedById: 9 });
      const result = await service.unmarkOverdue(1, admin, 'all');
      expect(result.overdueMarkedAt).toBeNull();
      expect(result.overdueMarkedById).toBeNull();
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1,
        9,
        PeriodicTaskAuditAction.OVERDUE_UNMARKED,
        null,
        null,
      );

      mockAuditService.logActionAsync.mockClear();
      mockTaskRepo.save.mockClear();
      mockFind({ id: 2, periodEndDate: '2000-01-01', overdueMarkedAt: null });
      await service.unmarkOverdue(2, admin, 'all');
      expect(mockTaskRepo.save).not.toHaveBeenCalled();
      expect(mockAuditService.logActionAsync).not.toHaveBeenCalled();
    });
  });
});