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
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
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
    assertEditableWhenLocked: jest.fn(),
  };
  // Phase 9: constructor giờ nhận thêm PeriodicTaskLinksService (dùng ở
  // attachLinkedChildrenChecklist()) - PHẢI mock ở đây, thiếu sẽ khiến
  // Nest báo "can't resolve dependencies" khi compile TestingModule.
  const mockLinksService = {
    getChildrenChecklist: jest.fn(),
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

  describe('findAllForTask', () => {
    it('gọi "1 cổng gác" tasksService.findOne() (periodic_tasks.view) trước khi trả danh sách', async () => {
      mockChecklistRepo.find.mockResolvedValue([{ id: 1, taskId, position: 0 }]);

      const result = await service.findAllForTask(taskId, employeeUser.id, employeeUser.role, 'own');

      expect(mockTasksService.findOne).toHaveBeenCalledWith(taskId, employeeUser.id, employeeUser.role, 'own');
      expect(mockChecklistRepo.find).toHaveBeenCalledWith({
        where: { taskId },
        order: { position: 'ASC', id: 'ASC' },
      });
      expect(result).toEqual([{ id: 1, taskId, position: 0 }]);
    });

    it('ném NotFoundException nếu Task ngoài phạm vi scope (mirror findOne() của Task cha)', async () => {
      mockTasksService.findOne.mockRejectedValue(new NotFoundException());

      await expect(
        service.findAllForTask(999, employeeUser.id, employeeUser.role, 'own'),
      ).rejects.toThrow(NotFoundException);
      expect(mockChecklistRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('thêm item mới với position = MAX(position) hiện có + 1', async () => {
      mockQb.getRawOne.mockResolvedValue({ max: 2 });
      mockChecklistRepo.save.mockResolvedValue(undefined);
      mockChecklistRepo.find.mockResolvedValue([
        { id: 1, position: 0 },
        { id: 2, position: 1 },
        { id: 3, position: 3 },
      ]);

      const result = await service.create(taskId, { content: 'Gọi khách' }, employeeUser, 'own');

      expect(mockChecklistRepo.create).toHaveBeenCalledWith({
        taskId,
        content: 'Gọi khách',
        position: 3,
        createdById: employeeUser.id,
      });
      expect(mockChecklistRepo.save).toHaveBeenCalled();
      expect(result).toHaveLength(3);
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        taskId,
        employeeUser.id,
        PeriodicTaskAuditAction.CHECKLIST_ITEM_ADDED,
        null,
        { content: 'Gọi khách' },
      );
    });

    it('position = 0 khi Task chưa có item nào (MAX trả về null)', async () => {
      mockQb.getRawOne.mockResolvedValue({ max: null });
      mockChecklistRepo.save.mockResolvedValue(undefined);
      mockChecklistRepo.find.mockResolvedValue([]);

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
      mockChecklistRepo.find.mockResolvedValue([{ ...existing, content: 'Mới', isDone: true }]);

      await service.update(taskId, 5, { content: 'Mới', isDone: true }, employeeUser, 'own');

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
      mockChecklistRepo.find.mockResolvedValue([]);

      const result = await service.remove(taskId, 5, employeeUser, 'own');

      expect(mockChecklistRepo.remove).toHaveBeenCalledWith(existing);
      expect(result).toEqual([]);
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        taskId,
        employeeUser.id,
        PeriodicTaskAuditAction.CHECKLIST_ITEM_REMOVED,
        { itemId: 5, content: 'Gọi khách' },
      );
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
});