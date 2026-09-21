import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PeriodicTaskLinksService } from './periodic-task-links.service';
import { PeriodicTasksService } from './periodic-tasks.service';
import { PeriodicTaskAuditService, PeriodicTaskAuditAction } from './periodic-task-audit.service';
import { PeriodicTaskLink } from '../../database/entities/periodic-task-link.entity';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { PeriodType } from '../../common/enums/period-type.enum';
import { Role } from '../../common/enums/role.enum';

function makeFakeQueryBuilder(overrides: { getMany?: any; getRawMany?: any } = {}) {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(overrides.getMany ?? []),
    getRawMany: jest.fn().mockResolvedValue(overrides.getRawMany ?? []),
  };
  return qb;
}

function makeTask(id: number, periodType: PeriodType, title = `Task ${id}`): PeriodicTask {
  return { id, periodType, title } as PeriodicTask;
}

describe('PeriodicTaskLinksService', () => {
  let service: PeriodicTaskLinksService;

  const mockLinkRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    manager: { query: jest.fn() },
  };
  const mockTaskRepo = {
    createQueryBuilder: jest.fn(),
    // ⚠️ Mới - `removeLink()` giờ fetch tiêu đề Task cha để dựng audit
    // snapshot sạch (`parentTask: {id, name}`) thay vì log raw `parentTaskId`.
    findOne: jest.fn(),
  };
  const mockTasksService = {
    findOne: jest.fn(),
    assertEditableWhenLocked: jest.fn(),
  };
  const mockAuditService = {
    logActionAsync: jest.fn(),
  };

  const userId = 1;
  const userRole = Role.EMPLOYEE;
  const scope = 'own';
  const user = { id: userId, role: userRole };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTasksService.assertEditableWhenLocked.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodicTaskLinksService,
        { provide: getRepositoryToken(PeriodicTaskLink), useValue: mockLinkRepo },
        { provide: getRepositoryToken(PeriodicTask), useValue: mockTaskRepo },
        { provide: PeriodicTasksService, useValue: mockTasksService },
        { provide: PeriodicTaskAuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<PeriodicTaskLinksService>(PeriodicTaskLinksService);
  });

  describe('addLink', () => {
    it('ném BadRequestException nếu tự gán làm cha của chính nó (không gọi tới findOne)', async () => {
      await expect(
        service.addLink(5, { parentTaskId: 5 }, user, scope),
      ).rejects.toThrow(BadRequestException);
      expect(mockTasksService.findOne).not.toHaveBeenCalled();
    });

    it('cho phép skip-level hợp lệ (Daily -> Monthly, bỏ qua Weekly)', async () => {
      const child = makeTask(1, PeriodType.DAILY);
      const parent = makeTask(2, PeriodType.MONTHLY);
      mockTasksService.findOne.mockResolvedValueOnce(child).mockResolvedValueOnce(parent);
      mockLinkRepo.findOne.mockResolvedValue(null);
      mockLinkRepo.find.mockResolvedValue([]); // không có cạnh nào khác -> không cycle
      mockLinkRepo.create.mockImplementation((data) => data);
      mockLinkRepo.save.mockImplementation((data) => Promise.resolve({ id: 99, ...data }));

      const result = await service.addLink(1, { parentTaskId: 2 }, user, scope);

      expect(result).toMatchObject({ childTaskId: 1, parentTaskId: 2, createdById: userId });
      // Phase 7 (PLAN mục 2.6): audit log `parent_linked` gắn vào Task CON.
      // ⚠️ FIX BUG THẬT (đợt rà soát audit log toàn bộ): resolve tiêu đề
      // Task cha (`parentTask: {id, name}`) thay vì log raw `parentTaskId`.
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1,
        userId,
        PeriodicTaskAuditAction.PARENT_LINKED,
        null,
        { parentTask: { id: 2, name: 'Task 2' } },
      );
    });

    it('chặn rank sai chiều (Weekly không được làm cha của Monthly)', async () => {
      const child = makeTask(1, PeriodType.MONTHLY);
      const parent = makeTask(2, PeriodType.WEEKLY);
      mockTasksService.findOne.mockResolvedValueOnce(child).mockResolvedValueOnce(parent);

      await expect(
        service.addLink(1, { parentTaskId: 2 }, user, scope),
      ).rejects.toThrow(BadRequestException);
      expect(mockLinkRepo.save).not.toHaveBeenCalled();
    });

    it('chặn rank ngang hàng (Weekly không được làm cha của Weekly khác)', async () => {
      const child = makeTask(1, PeriodType.WEEKLY);
      const parent = makeTask(2, PeriodType.WEEKLY);
      mockTasksService.findOne.mockResolvedValueOnce(child).mockResolvedValueOnce(parent);

      await expect(
        service.addLink(1, { parentTaskId: 2 }, user, scope),
      ).rejects.toThrow(BadRequestException);
    });

    it('chặn trùng cạnh đã tồn tại', async () => {
      const child = makeTask(1, PeriodType.DAILY);
      const parent = makeTask(2, PeriodType.WEEKLY);
      mockTasksService.findOne.mockResolvedValueOnce(child).mockResolvedValueOnce(parent);
      mockLinkRepo.findOne.mockResolvedValue({ id: 5, childTaskId: 1, parentTaskId: 2 });

      await expect(
        service.addLink(1, { parentTaskId: 2 }, user, scope),
      ).rejects.toThrow(BadRequestException);
      expect(mockLinkRepo.save).not.toHaveBeenCalled();
    });

    it('chặn tạo vòng lặp (cycle): child đang là tổ tiên của parent (BFS 2 tầng)', async () => {
      // Đồ thị giả lập đã có: 2 là cha của 4 (child=4,parent=2), rồi 1 là cha
      // của 2 (child=2,parent=1) - tức 1 đang là TỔ TIÊN của 4 qua đường
      // 4 -> 2 -> 1. Giờ cố tạo thêm cạnh (child=1, parent=4) -> vòng lặp
      // 1 -> 4 -> 2 -> 1. Rank vẫn hợp lệ (Daily(1) -> Yearly(4)) nên phải
      // chính cycle detection là nguyên nhân chặn, không phải rank.
      const child = makeTask(1, PeriodType.DAILY);
      const parent = makeTask(4, PeriodType.YEARLY);
      mockTasksService.findOne.mockResolvedValueOnce(child).mockResolvedValueOnce(parent);
      mockLinkRepo.findOne.mockResolvedValue(null);
      // BFS wouldCreateCycle(childId=1, parentId=4): frontier=[4] ->
      // tìm link có childTaskId=4 -> trả về (child=4, parent=2) -> chưa gặp
      // childId(1), tiếp frontier=[2] -> tìm link có childTaskId=2 -> trả về
      // (child=2, parent=1) -> parentTaskId=1 === childId(1) -> cycle=true.
      mockLinkRepo.find
        .mockResolvedValueOnce([{ childTaskId: 4, parentTaskId: 2 }])
        .mockResolvedValueOnce([{ childTaskId: 2, parentTaskId: 1 }]);

      await expect(
        service.addLink(1, { parentTaskId: 4 }, user, scope),
      ).rejects.toThrow(BadRequestException);
      expect(mockLinkRepo.save).not.toHaveBeenCalled();
      expect(mockLinkRepo.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('removeLink', () => {
    it('ném NotFoundException nếu liên kết không tồn tại', async () => {
      mockTasksService.findOne.mockResolvedValue(makeTask(1, PeriodType.DAILY));
      mockLinkRepo.findOne.mockResolvedValue(null);

      await expect(service.removeLink(1, 2, user, scope)).rejects.toThrow(NotFoundException);
    });

    it('gỡ liên kết thành công khi tồn tại', async () => {
      mockTasksService.findOne.mockResolvedValue(makeTask(1, PeriodType.DAILY));
      const existing = { id: 9, childTaskId: 1, parentTaskId: 2 };
      mockLinkRepo.findOne.mockResolvedValue(existing);
      mockLinkRepo.remove.mockResolvedValue(existing);
      mockTaskRepo.findOne.mockResolvedValue({ id: 2, title: 'Task 2' });

      const result = await service.removeLink(1, 2, user, scope);

      expect(result).toEqual({ deleted: true });
      expect(mockLinkRepo.remove).toHaveBeenCalledWith(existing);
      // ⚠️ FIX BUG THẬT (xem chú thích ở test `addLink`).
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        1,
        userId,
        PeriodicTaskAuditAction.PARENT_UNLINKED,
        { parentTask: { id: 2, name: 'Task 2' } },
      );
    });
  });

  describe('getChildren / getParents', () => {
    it('getChildren gọi findOne() trước (1 cổng gác) rồi query đúng chiều (parent_task_id = :taskId)', async () => {
      mockTasksService.findOne.mockResolvedValue(makeTask(1, PeriodType.MONTHLY));
      const qb = makeFakeQueryBuilder({ getMany: [makeTask(2, PeriodType.DAILY)] });
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getChildren(1, userId, userRole, scope);

      expect(mockTasksService.findOne).toHaveBeenCalledWith(1, userId, userRole, scope);
      expect(qb.innerJoin).toHaveBeenCalledWith('periodic_task_links', 'link', 'link.child_task_id = task.id');
      expect(qb.where).toHaveBeenCalledWith('link.parent_task_id = :taskId', { taskId: 1 });
      expect(result).toHaveLength(1);
    });

    it('getParents query đúng chiều ngược lại (child_task_id = :taskId)', async () => {
      mockTasksService.findOne.mockResolvedValue(makeTask(1, PeriodType.DAILY));
      const qb = makeFakeQueryBuilder({ getMany: [makeTask(2, PeriodType.MONTHLY)] });
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getParents(1, userId, userRole, scope);

      expect(qb.innerJoin).toHaveBeenCalledWith('periodic_task_links', 'link', 'link.parent_task_id = task.id');
      expect(qb.where).toHaveBeenCalledWith('link.child_task_id = :taskId', { taskId: 1 });
    });
  });

  describe('getChildrenChecklist (Phase 9 - tích hợp Task con vào chung Checklist)', () => {
    function makeChildWithStatus(
      id: number,
      isDoneState: boolean,
      overrides: Partial<PeriodicTask> = {},
    ): PeriodicTask {
      return {
        id,
        title: `Task con ${id}`,
        periodType: PeriodType.WEEKLY,
        periodStartDate: '2026-09-15',
        periodEndDate: '2026-09-21',
        status: { id: 1, code: isDoneState ? 'done' : 'pending', name: isDoneState ? 'Hoàn thành' : 'Đang làm', color: '#000', isDoneState },
        ...overrides,
      } as unknown as PeriodicTask;
    }

    it('gọi findOne() trước (1 cổng gác), query đúng chiều (parent_task_id = :taskId) và áp thêm applyViewFilter lên chính Task con', async () => {
      mockTasksService.findOne.mockResolvedValue(makeTask(1, PeriodType.MONTHLY));
      const qb = makeFakeQueryBuilder({ getMany: [makeChildWithStatus(2, false)] });
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getChildrenChecklist(1, userId, userRole, scope);

      expect(mockTasksService.findOne).toHaveBeenCalledWith(1, userId, userRole, scope);
      expect(qb.innerJoin).toHaveBeenCalledWith('periodic_task_links', 'link', 'link.child_task_id = task.id');
      expect(qb.where).toHaveBeenCalledWith('link.parent_task_id = :taskId', { taskId: 1 });
      expect(qb.andWhere).toHaveBeenCalledWith('task.deletedAt IS NULL');
      // scope 'own' (không phải ADMIN) -> applyViewFilter() PHẢI lọc lại chính
      // Task con (khác getChildren() ở trên - chỉ check quyền trên Task cha).
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('task.createdById = :accessUserId'),
        { accessUserId: userId },
      );
      expect(result).toHaveLength(1);
    });

    it('map đúng shape LinkedChildChecklistEntry - isDone = status.isDoneState CỦA TASK CON, không phải cờ lưu cứng', async () => {
      mockTasksService.findOne.mockResolvedValue(makeTask(1, PeriodType.MONTHLY));
      const doneChild = makeChildWithStatus(2, true);
      const qb = makeFakeQueryBuilder({ getMany: [doneChild] });
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getChildrenChecklist(1, userId, userRole, scope);

      expect(result[0]).toEqual({
        childTaskId: 2,
        title: 'Task con 2',
        isDone: true,
        status: { id: 1, code: 'done', name: 'Hoàn thành', color: '#000' },
        periodType: PeriodType.WEEKLY,
        periodStartDate: '2026-09-15',
        periodEndDate: '2026-09-21',
      });
    });

    it('trả mảng rỗng khi Task cha chưa liên kết Task con nào (hoặc Task con ngoài phạm vi scope đã bị applyViewFilter lọc hết)', async () => {
      mockTasksService.findOne.mockResolvedValue(makeTask(1, PeriodType.MONTHLY));
      const qb = makeFakeQueryBuilder({ getMany: [] });
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getChildrenChecklist(1, userId, userRole, scope);

      expect(result).toEqual([]);
    });

    it('Admin không bị applyViewFilter lọc thêm theo scope (thấy mọi Task con đã liên kết)', async () => {
      mockTasksService.findOne.mockResolvedValue(makeTask(1, PeriodType.MONTHLY));
      const qb = makeFakeQueryBuilder({ getMany: [makeChildWithStatus(2, false)] });
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getChildrenChecklist(1, 99, Role.ADMIN, null);

      // Chỉ có andWhere('task.deletedAt IS NULL') - KHÔNG có thêm andWhere lọc scope nào khác.
      expect(qb.andWhere).toHaveBeenCalledTimes(1);
      expect(qb.andWhere).toHaveBeenCalledWith('task.deletedAt IS NULL');
    });
  });

  describe('getChildrenChecklistProgressBatch (đếm X/Z cho danh sách)', () => {
    it('trả Map rỗng ngay khi không có Task cha nào - KHÔNG query DB', async () => {
      const result = await service.getChildrenChecklistProgressBatch([], userId, userRole, scope);

      expect(result.size).toBe(0);
      expect(mockTaskRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('gom nhóm theo parent_task_id, ép số (MySQL trả SUM/COUNT dạng chuỗi) và áp applyViewFilter lên Task con', async () => {
      const qb = makeFakeQueryBuilder({
        getRawMany: [
          { parentId: 1, total: '3', done: '2' },
          { parentId: 2, total: '1', done: null },
        ],
      });
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getChildrenChecklistProgressBatch([1, 2, 3], userId, userRole, scope);

      expect(qb.innerJoin).toHaveBeenCalledWith('periodic_task_links', 'link', 'link.child_task_id = task.id');
      expect(qb.where).toHaveBeenCalledWith('link.parent_task_id IN (:...parentTaskIds)', {
        parentTaskIds: [1, 2, 3],
      });
      expect(qb.andWhere).toHaveBeenCalledWith('task.deletedAt IS NULL');
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('task.createdById = :accessUserId'),
        { accessUserId: userId },
      );
      expect(qb.groupBy).toHaveBeenCalledWith('link.parent_task_id');
      expect(result.get(1)).toEqual({ done: 2, total: 3 });
      expect(result.get(2)).toEqual({ done: 0, total: 1 });
      expect(result.has(3)).toBe(false);
    });
  });

  describe('getLinksAmong (Phase 8 - batch cho UI nối/xếp hàng)', () => {
    it('trả rỗng ngay khi taskIds rỗng - KHÔNG query DB', async () => {
      const result = await service.getLinksAmong([], userId, userRole, scope);

      expect(result).toEqual({ edges: [] });
      expect(mockTaskRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('chỉ trả cạnh mà CẢ 2 đầu đều nằm trong tập ID đã lọc qua applyViewFilter (RBAC)', async () => {
      // Người gọi CHỈ được xem task 1 và 2 (task 3 ngoài phạm vi, dù FE có
      // gửi lên trong taskIds) - applyViewFilter (qua getRawMany) chỉ trả 1, 2.
      const qb = makeFakeQueryBuilder({ getRawMany: [{ id: 1 }, { id: 2 }] });
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);
      mockLinkRepo.find.mockResolvedValue([
        { id: 100, childTaskId: 1, parentTaskId: 2 },
      ]);

      const result = await service.getLinksAmong([1, 2, 3], userId, userRole, scope);

      expect(qb.where).toHaveBeenCalledWith('task.id IN (:...taskIds)', { taskIds: [1, 2, 3] });
      const [{ where }] = mockLinkRepo.find.mock.calls[0];
      expect(where.childTaskId.type).toBe('in');
      expect(where.childTaskId.value).toEqual([1, 2]);
      expect(where.parentTaskId.type).toBe('in');
      expect(where.parentTaskId.value).toEqual([1, 2]);
      expect(result).toEqual({ edges: [{ parentTaskId: 2, childTaskId: 1 }] });
    });

    it('trả rỗng khi không có Task nào trong taskIds nằm trong phạm vi xem - KHÔNG query bảng link', async () => {
      const qb = makeFakeQueryBuilder({ getRawMany: [] });
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getLinksAmong([99], userId, userRole, scope);

      expect(result).toEqual({ edges: [] });
      expect(mockLinkRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('getRollup', () => {
    it('tính đúng % khi có con (đúng công thức PLAN mục 2.3)', async () => {
      mockTasksService.findOne.mockResolvedValue(makeTask(1, PeriodType.MONTHLY));
      mockLinkRepo.manager.query.mockResolvedValue([{ total_children: '10', done_children: '1' }]);

      const result = await service.getRollup(1, userId, userRole, scope);

      expect(result).toEqual({ totalChildren: 10, doneChildren: 1, percent: 10 });
    });

    it('trả percent = null khi totalChildren = 0 (chưa có việc con)', async () => {
      mockTasksService.findOne.mockResolvedValue(makeTask(1, PeriodType.MONTHLY));
      mockLinkRepo.manager.query.mockResolvedValue([{ total_children: '0', done_children: '0' }]);

      const result = await service.getRollup(1, userId, userRole, scope);

      expect(result).toEqual({ totalChildren: 0, doneChildren: 0, percent: null });
    });

    it('query loại trừ status is_excluded_from_rollup=1 (kiểm tra SQL truyền đúng điều kiện)', async () => {
      mockTasksService.findOne.mockResolvedValue(makeTask(1, PeriodType.MONTHLY));
      mockLinkRepo.manager.query.mockResolvedValue([{ total_children: '3', done_children: '3' }]);

      const result = await service.getRollup(1, userId, userRole, scope);

      const [sql] = mockLinkRepo.manager.query.mock.calls[0];
      expect(sql).toContain('is_excluded_from_rollup = 0');
      expect(result.percent).toBe(100);
    });
  });
});