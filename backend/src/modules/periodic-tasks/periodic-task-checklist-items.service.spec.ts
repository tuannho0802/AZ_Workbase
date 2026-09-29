import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PeriodicTaskChecklistItemsService } from './periodic-task-checklist-items.service';
import { PeriodicTasksService } from './periodic-tasks.service';
import { PeriodicTaskLinksService } from './periodic-task-links.service';
import { PeriodicTaskChecklistItem } from '../../database/entities/periodic-task-checklist-item.entity';
import { Role } from '../../common/enums/role.enum';
import { PeriodicTaskAuditService, PeriodicTaskAuditAction } from './periodic-task-audit.service';

describe('PeriodicTaskChecklistItemsService', () => {
  let service: PeriodicTaskChecklistItemsService;

  const mockQb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
    getOne: jest.fn(),
  };

  const mockChecklistRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((x) => x),
    save: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQb),
  };

  const mockTasksService = {
    findOne: jest.fn(),
    assertCanView: jest.fn(),
    assertEditableWhenLocked: jest.fn(),
    // Notification Phase 2: mock rỗng (no-op mặc định) - test nghiệp vụ
    // chính không quan tâm thông báo.
    notifyTaskSafely: jest.fn(),
    emitTaskNotification: jest.fn(),
    getSecondaryAssigneeIds: jest.fn().mockResolvedValue([]),
    changeStatusByCode: jest.fn().mockResolvedValue(undefined),
  };
  // Phase 9: constructor giờ nhận thêm PeriodicTaskLinksService (dùng ở
  // attachLinkedChildrenChecklist()) - PHẢI mock ở đây, thiếu sẽ khiến
  // Nest báo "can't resolve dependencies" khi compile TestingModule.
  const mockLinksService = {
    getChildrenChecklist: jest.fn(),
    getChildrenChecklistProgressBatch: jest.fn(),
  };
  const mockAuditService = {
    logActionAsync: jest.fn(),
  };

  const taskId = 10;
  const employeeUser = { id: 1, role: Role.EMPLOYEE, isRootAdmin: false, departmentId: 2, positionId: null };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTasksService.findOne.mockResolvedValue({ id: taskId, isLocked: false });
    mockTasksService.assertEditableWhenLocked.mockResolvedValue(undefined);
    mockTasksService.assertCanView.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodicTaskChecklistItemsService,
        { provide: getRepositoryToken(PeriodicTaskChecklistItem), useValue: mockChecklistRepo },
        { provide: PeriodicTasksService, useValue: mockTasksService },
        { provide: PeriodicTaskLinksService, useValue: mockLinksService },
        { provide: PeriodicTaskAuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<PeriodicTaskChecklistItemsService>(PeriodicTaskChecklistItemsService);
  });

  describe('findPage (phân trang checklist, tối đa 10/trang)', () => {
    it('dùng cổng gác NHẸ assertCanView (không findOne nặng), trả trang + tổng/xong của TOÀN Task', async () => {
      mockQb.getRawOne.mockResolvedValue({ total: '23', done: '7' });
      mockChecklistRepo.find.mockResolvedValue([{ id: 11, taskId, position: 10 }]);

      const result = await service.findPage(taskId, { page: 2, limit: 10 }, employeeUser.id, employeeUser.role, 'own');

      expect(mockTasksService.assertCanView).toHaveBeenCalledWith(taskId, employeeUser.id, employeeUser.role, 'own');
      expect(mockTasksService.findOne).not.toHaveBeenCalled();
      expect(mockChecklistRepo.find).toHaveBeenCalledWith({
        where: { taskId },
        order: { position: 'ASC', id: 'ASC' },
        skip: 10,
        take: 10,
      });
      expect(result).toEqual({ data: [{ id: 11, taskId, position: 10 }], total: 23, done: 7, filteredTotal: 23, page: 2, limit: 10, totalPages: 3 });
    });

    it('mặc định trang 1, 10 dòng; Task chưa có item -> total 0, totalPages 0', async () => {
      mockQb.getRawOne.mockResolvedValue({ total: '0', done: null });
      mockChecklistRepo.find.mockResolvedValue([]);

      const result = await service.findPage(taskId, {}, employeeUser.id, employeeUser.role, 'own');

      expect(mockChecklistRepo.find).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 10 }));
      expect(result).toMatchObject({ total: 0, done: 0, page: 1, limit: 10, totalPages: 0 });
    });

    it('sort=newest -> ORDER BY createdAt DESC, id DESC; sort=oldest -> ASC', async () => {
      mockQb.getRawOne.mockResolvedValue({ total: '5', done: '2' });
      mockChecklistRepo.find.mockResolvedValue([]);

      await service.findPage(taskId, { sort: 'newest' }, employeeUser.id, employeeUser.role, 'own');
      expect(mockChecklistRepo.find).toHaveBeenLastCalledWith(
        expect.objectContaining({ order: { createdAt: 'DESC', id: 'DESC' } }),
      );

      await service.findPage(taskId, { sort: 'oldest' }, employeeUser.id, employeeUser.role, 'own');
      expect(mockChecklistRepo.find).toHaveBeenLastCalledWith(
        expect.objectContaining({ order: { createdAt: 'ASC', id: 'ASC' } }),
      );
    });

    it('hideDone=true -> lọc isDone=false, phân trang theo filteredTotal nhưng total/done vẫn của toàn Task', async () => {
      mockQb.getRawOne.mockResolvedValue({ total: '25', done: '15' });
      mockChecklistRepo.find.mockResolvedValue([]);

      const result = await service.findPage(taskId, { hideDone: true }, employeeUser.id, employeeUser.role, 'own');

      expect(mockChecklistRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { taskId, isDone: false } }),
      );
      expect(result).toMatchObject({ total: 25, done: 15, filteredTotal: 10, totalPages: 1 });
    });

    it('ném NotFoundException nếu Task ngoài phạm vi scope và KHÔNG chạm dữ liệu checklist', async () => {
      mockTasksService.assertCanView.mockRejectedValue(new NotFoundException());

      await expect(service.findPage(999, {}, employeeUser.id, employeeUser.role, 'own')).rejects.toThrow(NotFoundException);
      expect(mockChecklistRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('create - Guard mở lại Task đã hoàn thành', () => {
    beforeEach(() => {
      mockQb.getRawOne.mockResolvedValueOnce({ max: 0 }).mockResolvedValueOnce({ total: '2', done: '1' });
      mockChecklistRepo.save.mockResolvedValue(undefined);
    });
    afterEach(() => {
      mockQb.getRawOne.mockReset(); // xoá giá trị Once chưa dùng (test lỗi không chạm tới), tránh rò sang test khác
    });

    it('Task done + reopen=true -> đổi in_progress + kéo period_end tới hôm nay, TRƯỚC khi ghi item', async () => {
      const order: string[] = [];
      mockTasksService.findOne.mockResolvedValue({ id: taskId, isLocked: false, status: { code: 'done' } });
      mockTasksService.changeStatusByCode.mockImplementation(async () => { order.push('status'); });
      mockChecklistRepo.save.mockImplementation(async () => { order.push('save'); });

      await service.create(taskId, { content: 'Thêm', reopen: true }, employeeUser, 'own');

      expect(mockTasksService.changeStatusByCode).toHaveBeenCalledWith(
        expect.objectContaining({ id: taskId }), 'in_progress', employeeUser, 'own', { extendPeriodEndToToday: true },
      );
      expect(order).toEqual(['status', 'save']);
    });

    it('Task done + không reopen ("Đã hoàn thành") -> chỉ thêm item, KHÔNG đổi status', async () => {
      mockTasksService.findOne.mockResolvedValue({ id: taskId, isLocked: false, status: { code: 'done' } });
      await service.create(taskId, { content: 'Thêm' }, employeeUser, 'own');
      expect(mockTasksService.changeStatusByCode).not.toHaveBeenCalled();
      expect(mockChecklistRepo.save).toHaveBeenCalled();
    });

    it('Task đang in_progress + reopen=true -> bỏ qua (không phải Task đã xong)', async () => {
      mockTasksService.findOne.mockResolvedValue({ id: taskId, isLocked: false, status: { code: 'in_progress' } });
      await service.create(taskId, { content: 'Thêm', reopen: true }, employeeUser, 'own');
      expect(mockTasksService.changeStatusByCode).not.toHaveBeenCalled();
    });

    it('đổi status lỗi -> KHÔNG tạo item', async () => {
      mockTasksService.findOne.mockResolvedValue({ id: taskId, isLocked: false, status: { code: 'done' } });
      mockTasksService.changeStatusByCode.mockRejectedValue(new Error('boom'));
      await expect(service.create(taskId, { content: 'Thêm', reopen: true }, employeeUser, 'own')).rejects.toThrow('boom');
      expect(mockChecklistRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('thêm item mới với position = MAX(position) hiện có + 1', async () => {
      mockQb.getRawOne
        .mockResolvedValueOnce({ max: 2 }) // MAX(position)
        .mockResolvedValueOnce({ total: '4', done: '1' }); // getSummary
      mockChecklistRepo.save.mockResolvedValue(undefined);

      const result = await service.create(taskId, { content: 'Gọi khách' }, employeeUser, 'own');

      expect(mockChecklistRepo.create).toHaveBeenCalledWith({
        taskId,
        content: 'Gọi khách',
        position: 3,
        createdById: employeeUser.id,
      });
      expect(mockChecklistRepo.save).toHaveBeenCalled();
      expect(result).toEqual({
        item: { taskId, content: 'Gọi khách', position: 3, createdById: employeeUser.id },
        total: 4,
        done: 1,
      });
      expect(mockChecklistRepo.find).not.toHaveBeenCalled();
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        taskId,
        employeeUser.id,
        PeriodicTaskAuditAction.CHECKLIST_ITEM_ADDED,
        null,
        { content: 'Gọi khách' },
      );
    });

    it('position = 0 khi Task chưa có item nào (MAX trả về null)', async () => {
      mockQb.getRawOne
        .mockResolvedValueOnce({ max: null })
        .mockResolvedValueOnce({ total: '1', done: '0' });
      mockChecklistRepo.save.mockResolvedValue(undefined);

      await service.create(taskId, { content: 'Item đầu tiên' }, employeeUser, 'own');

      expect(mockChecklistRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ position: 0 }),
      );
    });

    it('ném ForbiddenException nếu Task đang khoá và thiếu periodic_tasks.edit_locked (Phase 5)', async () => {
      mockTasksService.assertEditableWhenLocked.mockRejectedValue(new ForbiddenException());

      await expect(
        service.create(taskId, { content: 'X' }, employeeUser, 'own'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockChecklistRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('update - Guard ép status khi TICK (To-do không được có checklist đã tick)', () => {
    const mkItem = () => ({ id: 5, taskId, content: 'A', isDone: false, position: 0 });

    it('Task To-do tick thường (FE không gửi gì) -> ÉP in_progress TRƯỚC khi lưu tick', async () => {
      const order: string[] = [];
      mockTasksService.findOne.mockResolvedValue({ id: taskId, isLocked: false, status: { code: 'not_started' } });
      mockTasksService.changeStatusByCode.mockImplementation(async () => { order.push('status'); });
      mockChecklistRepo.findOne.mockResolvedValue(mkItem());
      mockChecklistRepo.save.mockImplementation(async () => { order.push('save'); });

      await service.update(taskId, 5, { isDone: true }, employeeUser, 'own');

      expect(mockTasksService.changeStatusByCode).toHaveBeenCalledWith(
        expect.objectContaining({ id: taskId }), 'in_progress', employeeUser, 'own',
      );
      expect(order).toEqual(['status', 'save']);
    });

    it('FE xin in_review -> ép in_review và KHÔNG lưu nextStatusCode vào item', async () => {
      mockTasksService.findOne.mockResolvedValue({ id: taskId, isLocked: false, status: { code: 'in_progress' } });
      const item = mkItem();
      mockChecklistRepo.findOne.mockResolvedValue(item);

      await service.update(taskId, 5, { isDone: true, nextStatusCode: 'in_review' }, employeeUser, 'own');

      expect(mockTasksService.changeStatusByCode).toHaveBeenCalledWith(
        expect.objectContaining({ id: taskId }), 'in_review', employeeUser, 'own',
      );
      expect(item).not.toHaveProperty('nextStatusCode');
    });

    it('đổi status lỗi -> tick KHÔNG được lưu', async () => {
      mockTasksService.findOne.mockResolvedValue({ id: taskId, isLocked: false, status: { code: 'not_started' } });
      mockTasksService.changeStatusByCode.mockRejectedValue(new Error('boom'));
      mockChecklistRepo.findOne.mockResolvedValue(mkItem());
      await expect(service.update(taskId, 5, { isDone: true }, employeeUser, 'own')).rejects.toThrow('boom');
      expect(mockChecklistRepo.save).not.toHaveBeenCalled();
    });

    it('bỏ tick / task in_progress tick thường / task in_review -> không đổi status', async () => {
      mockChecklistRepo.findOne.mockResolvedValue({ ...mkItem(), isDone: true });
      mockTasksService.findOne.mockResolvedValue({ id: taskId, isLocked: false, status: { code: 'not_started' } });
      await service.update(taskId, 5, { isDone: false }, employeeUser, 'own');

      mockChecklistRepo.findOne.mockResolvedValue(mkItem());
      mockTasksService.findOne.mockResolvedValue({ id: taskId, isLocked: false, status: { code: 'in_progress' } });
      await service.update(taskId, 5, { isDone: true }, employeeUser, 'own');

      mockChecklistRepo.findOne.mockResolvedValue(mkItem());
      mockTasksService.findOne.mockResolvedValue({ id: taskId, isLocked: false, status: { code: 'in_review' } });
      await service.update(taskId, 5, { isDone: true, nextStatusCode: 'in_progress' }, employeeUser, 'own');

      expect(mockTasksService.changeStatusByCode).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('ném NotFoundException nếu item không tồn tại hoặc thuộc Task khác (không rò rỉ chéo Task)', async () => {
      mockChecklistRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update(taskId, 999, { isDone: true }, employeeUser, 'own'),
      ).rejects.toThrow(NotFoundException);
      expect(mockChecklistRepo.findOne).toHaveBeenCalledWith({ where: { id: 999, taskId } });
      expect(mockChecklistRepo.save).not.toHaveBeenCalled();
    });

    it('sửa content/isDone thành công', async () => {
      const existing = { id: 5, taskId, content: 'Cũ', isDone: false, position: 0 };
      mockChecklistRepo.findOne.mockResolvedValue(existing);
      mockChecklistRepo.save.mockResolvedValue(undefined);

      const updated = await service.update(taskId, 5, { content: 'Mới', isDone: true }, employeeUser, 'own');

      expect(updated).toMatchObject({ id: 5, content: 'Mới', isDone: true });
      expect(mockChecklistRepo.find).not.toHaveBeenCalled();

      expect(mockChecklistRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 5, content: 'Mới', isDone: true }),
      );
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        taskId,
        employeeUser.id,
        PeriodicTaskAuditAction.CHECKLIST_ITEM_UPDATED,
        { itemId: 5, content: 'Cũ', isDone: false },
        { itemId: 5, content: 'Mới', isDone: true },
      );
    });
  });

  describe('remove', () => {
    it('ném NotFoundException nếu item không tồn tại trong Task', async () => {
      mockChecklistRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(taskId, 999, employeeUser, 'own')).rejects.toThrow(NotFoundException);
      expect(mockChecklistRepo.remove).not.toHaveBeenCalled();
    });

    it('xoá thành công khi tồn tại (hard delete)', async () => {
      const existing = { id: 5, taskId, content: 'Gọi khách' };
      mockChecklistRepo.findOne.mockResolvedValue(existing);
      mockChecklistRepo.remove.mockResolvedValue(undefined);

      const result = await service.remove(taskId, 5, employeeUser, 'own');

      expect(mockChecklistRepo.remove).toHaveBeenCalledWith(existing);
      expect(result).toEqual({ deleted: true });
      expect(mockChecklistRepo.find).not.toHaveBeenCalled();
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        taskId,
        employeeUser.id,
        PeriodicTaskAuditAction.CHECKLIST_ITEM_REMOVED,
        { itemId: 5, content: 'Gọi khách' },
      );
    });
  });

  describe('move (đổi chỗ với item liền kề, xuyên trang)', () => {
    it('đổi position với item liền kề khi position khác nhau, ghi log', async () => {
      mockChecklistRepo.findOne.mockResolvedValue({ id: 5, taskId, position: 10 });
      mockQb.getOne.mockResolvedValue({ id: 4, taskId, position: 9 });
      mockChecklistRepo.update.mockResolvedValue(undefined);

      const result = await service.move(taskId, 5, 'up', employeeUser, 'own');

      expect(result).toEqual({ moved: true });
      expect(mockChecklistRepo.update).toHaveBeenCalledWith({ id: 5, taskId }, { position: 9 });
      expect(mockChecklistRepo.update).toHaveBeenCalledWith({ id: 4, taskId }, { position: 10 });
      expect(mockQb.orderBy).toHaveBeenCalledWith('item.position', 'DESC');
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        taskId, employeeUser.id, PeriodicTaskAuditAction.CHECKLIST_ITEMS_REORDERED, null, { itemId: 5, direction: 'up' },
      );
    });

    it('xuống: sắp xếp neighbor tăng dần', async () => {
      mockChecklistRepo.findOne.mockResolvedValue({ id: 5, taskId, position: 1 });
      mockQb.getOne.mockResolvedValue({ id: 6, taskId, position: 2 });

      await service.move(taskId, 5, 'down', employeeUser, 'own');

      expect(mockQb.orderBy).toHaveBeenCalledWith('item.position', 'ASC');
    });

    it('không có item liền kề (đã ở đầu/cuối) -> moved=false, không ghi gì', async () => {
      mockChecklistRepo.findOne.mockResolvedValue({ id: 1, taskId, position: 0 });
      mockQb.getOne.mockResolvedValue(null);

      expect(await service.move(taskId, 1, 'up', employeeUser, 'own')).toEqual({ moved: false });
      expect(mockChecklistRepo.update).not.toHaveBeenCalled();
      expect(mockAuditService.logActionAsync).not.toHaveBeenCalled();
    });

    it('2 item trùng position -> đánh lại số thứ tự cả Task để phép đổi chỗ có hiệu lực', async () => {
      mockChecklistRepo.findOne.mockResolvedValue({ id: 5, taskId, position: 3 });
      mockQb.getOne.mockResolvedValue({ id: 4, taskId, position: 3 });
      mockChecklistRepo.find.mockResolvedValue([{ id: 3 }, { id: 4 }, { id: 5 }]);

      await service.move(taskId, 5, 'up', employeeUser, 'own');

      expect(mockChecklistRepo.update).toHaveBeenCalledWith({ id: 3, taskId }, { position: 0 });
      expect(mockChecklistRepo.update).toHaveBeenCalledWith({ id: 5, taskId }, { position: 1 });
      expect(mockChecklistRepo.update).toHaveBeenCalledWith({ id: 4, taskId }, { position: 2 });
    });

    it('ném NotFoundException nếu item không thuộc Task; ForbiddenException nếu Task khoá', async () => {
      mockChecklistRepo.findOne.mockResolvedValue(null);
      await expect(service.move(taskId, 999, 'up', employeeUser, 'own')).rejects.toThrow(NotFoundException);

      mockTasksService.assertEditableWhenLocked.mockRejectedValue(new ForbiddenException());
      await expect(service.move(taskId, 5, 'up', employeeUser, 'own')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('reorder', () => {
    it('ném BadRequestException nếu itemIds thiếu 1 item hiện có', async () => {
      mockChecklistRepo.find.mockResolvedValue([
        { id: 1, position: 0 },
        { id: 2, position: 1 },
        { id: 3, position: 2 },
      ]);

      await expect(
        service.reorder(taskId, { itemIds: [1, 2] }, employeeUser, 'own'),
      ).rejects.toThrow(BadRequestException);
      expect(mockChecklistRepo.update).not.toHaveBeenCalled();
    });

    it('ném BadRequestException nếu itemIds chứa ID không thuộc Task (thừa/lạ)', async () => {
      mockChecklistRepo.find.mockResolvedValue([
        { id: 1, position: 0 },
        { id: 2, position: 1 },
      ]);

      await expect(
        service.reorder(taskId, { itemIds: [1, 2, 999] }, employeeUser, 'own'),
      ).rejects.toThrow(BadRequestException);
      expect(mockChecklistRepo.update).not.toHaveBeenCalled();
    });

    it('sắp xếp lại thành công khi itemIds là hoán vị đầy đủ - ghi position theo đúng index', async () => {
      mockChecklistRepo.find
        .mockResolvedValueOnce([
          { id: 1, position: 0 },
          { id: 2, position: 1 },
          { id: 3, position: 2 },
        ])
        .mockResolvedValueOnce([
          { id: 3, position: 0 },
          { id: 1, position: 1 },
          { id: 2, position: 2 },
        ]);
      mockChecklistRepo.update.mockResolvedValue(undefined);

      const result = await service.reorder(taskId, { itemIds: [3, 1, 2] }, employeeUser, 'own');

      expect(mockChecklistRepo.update).toHaveBeenCalledWith({ id: 3, taskId }, { position: 0 });
      expect(mockChecklistRepo.update).toHaveBeenCalledWith({ id: 1, taskId }, { position: 1 });
      expect(mockChecklistRepo.update).toHaveBeenCalledWith({ id: 2, taskId }, { position: 2 });
      expect(result[0].id).toBe(3);
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        taskId,
        employeeUser.id,
        PeriodicTaskAuditAction.CHECKLIST_ITEMS_REORDERED,
        null,
        { itemIds: [3, 1, 2] },
      );
    });

    it('ném ForbiddenException nếu Task đang khoá và thiếu periodic_tasks.edit_locked', async () => {
      mockTasksService.assertEditableWhenLocked.mockRejectedValue(new ForbiddenException());

      await expect(
        service.reorder(taskId, { itemIds: [1, 2] }, employeeUser, 'own'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockChecklistRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('attachChecklistItems', () => {
    it('luôn trả về mảng checklistItems (không ẩn theo quyền, mirror attachSecondaryAssignees Phase 4)', async () => {
      mockChecklistRepo.find.mockResolvedValue([{ id: 1, taskId, content: 'A', position: 0 }]);

      const task = { id: taskId, title: 'Task A' };
      const result = await service.attachChecklistItems(task);

      expect(result).toEqual({
        id: taskId,
        title: 'Task A',
        checklistItems: [{ id: 1, taskId, content: 'A', position: 0 }],
      });
    });
  });

  describe('attachLinkedChildrenChecklist', () => {
    it('đính linkedChildrenChecklist lấy LIVE từ linksService.getChildrenChecklist(), tách biệt hoàn toàn checklistItems', async () => {
      const linkedEntries = [
        {
          childTaskId: 20,
          title: 'Task con A',
          isDone: true,
          status: { id: 1, code: 'done', name: 'Hoàn thành', color: '#52c41a' },
          periodType: 'week',
          periodStartDate: '2026-09-15',
          periodEndDate: '2026-09-21',
        },
      ];
      mockLinksService.getChildrenChecklist.mockResolvedValue(linkedEntries);

      const task = { id: taskId, title: 'Task A', checklistItems: [{ id: 1, taskId, content: 'A' }] };
      const result = await service.attachLinkedChildrenChecklist(
        task,
        employeeUser.id,
        employeeUser.role,
        'own',
      );

      expect(mockLinksService.getChildrenChecklist).toHaveBeenCalledWith(
        taskId,
        employeeUser.id,
        employeeUser.role,
        'own',
      );
      expect(result).toEqual({
        id: taskId,
        title: 'Task A',
        checklistItems: [{ id: 1, taskId, content: 'A' }],
        linkedChildrenChecklist: linkedEntries,
      });
      // KHÔNG chạm bảng periodic_task_checklist_items - luồng hoàn toàn tách biệt.
      expect(mockChecklistRepo.find).not.toHaveBeenCalled();
      expect(mockChecklistRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('linkedChildrenChecklist rỗng khi Task cha chưa có Task con nào liên kết', async () => {
      mockLinksService.getChildrenChecklist.mockResolvedValue([]);

      const result = await service.attachLinkedChildrenChecklist(
        { id: taskId, title: 'Task A' },
        employeeUser.id,
        employeeUser.role,
        'own',
      );

      expect(result.linkedChildrenChecklist).toEqual([]);
    });

    it('isDone của từng dòng phản ánh ĐÚNG status.isDoneState hiện tại của Task con (auto-tick, không cờ lưu cứng)', async () => {
      mockLinksService.getChildrenChecklist.mockResolvedValue([
        {
          childTaskId: 21,
          title: 'Task con chưa xong',
          isDone: false,
          status: { id: 2, code: 'pending', name: 'Đang làm', color: '#faad14' },
          periodType: 'week',
          periodStartDate: '2026-09-15',
          periodEndDate: '2026-09-21',
        },
      ]);

      const result = await service.attachLinkedChildrenChecklist(
        { id: taskId, title: 'Task A' },
        employeeUser.id,
        employeeUser.role,
        'own',
      );

      expect(result.linkedChildrenChecklist[0].isDone).toBe(false);
    });
  });
  describe('attachChecklistProgressToList (X/Z cho danh sách)', () => {
    function mockItemRows(rows: any[]) {
      const qb: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(rows),
      };
      mockChecklistRepo.createQueryBuilder.mockReturnValueOnce(qb);
      return qb;
    }

    it('trả mảng rỗng và KHÔNG query khi danh sách rỗng', async () => {
      const result = await service.attachChecklistProgressToList([], employeeUser.id, employeeUser.role, 'own');

      expect(result).toEqual([]);
      expect(mockChecklistRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockLinksService.getChildrenChecklistProgressBatch).not.toHaveBeenCalled();
    });

    it('cộng checklist item thật + Task con (cùng cách đếm với modal), Task chưa có gì -> 0/0', async () => {
      const qb = mockItemRows([{ taskId: '10', total: '2', done: '1' }]);
      mockLinksService.getChildrenChecklistProgressBatch.mockResolvedValue(
        new Map([
          [10, { done: 1, total: 1 }],
          [11, { done: 0, total: 2 }],
        ]),
      );

      const result = await service.attachChecklistProgressToList(
        [{ id: 10 }, { id: 11 }, { id: 12 }],
        employeeUser.id,
        employeeUser.role,
        'own',
      );

      expect(qb.where).toHaveBeenCalledWith('item.task_id IN (:...taskIds)', { taskIds: [10, 11, 12] });
      expect(mockLinksService.getChildrenChecklistProgressBatch).toHaveBeenCalledWith(
        [10, 11, 12],
        employeeUser.id,
        employeeUser.role,
        'own',
      );
      expect(result.map((t) => t.checklistProgress)).toEqual([
        { done: 2, total: 3 },
        { done: 0, total: 2 },
        { done: 0, total: 0 },
      ]);
    });
  });
});