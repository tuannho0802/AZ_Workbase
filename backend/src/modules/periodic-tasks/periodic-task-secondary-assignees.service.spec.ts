import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PeriodicTaskSecondaryAssigneesService } from './periodic-task-secondary-assignees.service';
import { PeriodicTasksService } from './periodic-tasks.service';
import { PeriodicTaskAuditService, PeriodicTaskAuditAction } from './periodic-task-audit.service';
import { PeriodicTaskSecondaryAssignee } from '../../database/entities/periodic-task-secondary-assignee.entity';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../common/enums/role.enum';

describe('PeriodicTaskSecondaryAssigneesService', () => {
  let service: PeriodicTaskSecondaryAssigneesService;

  const mockSecondaryRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((x) => x),
    save: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const mockUserRepo = {
    findOne: jest.fn(),
  };
  const mockTasksService = {
    findOne: jest.fn(),
    assertEditableWhenLocked: jest.fn(),
    // Notification Phase 2: mock rỗng (no-op mặc định, giống hành vi thật khi
    // NOTIFICATIONS_ENABLED tắt) - test nghiệp vụ chính không quan tâm thông báo.
    notifyTaskSafely: jest.fn(),
    emitTaskNotification: jest.fn(),
  };
  const mockAuditService = {
    logActionAsync: jest.fn(),
  };

  const taskId = 10;
  const primaryAssigneeId = 3;
  const employeeUser = { id: 1, role: Role.EMPLOYEE, isRootAdmin: false, departmentId: 2, positionId: null };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTasksService.findOne.mockResolvedValue({ id: taskId, primaryAssigneeId });
    mockTasksService.assertEditableWhenLocked.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodicTaskSecondaryAssigneesService,
        { provide: getRepositoryToken(PeriodicTaskSecondaryAssignee), useValue: mockSecondaryRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: PeriodicTasksService, useValue: mockTasksService },
        { provide: PeriodicTaskAuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<PeriodicTaskSecondaryAssigneesService>(PeriodicTaskSecondaryAssigneesService);
  });

  describe('addSecondaryAssignee', () => {
    it('ném BadRequestException nếu userId trùng primaryAssigneeId (spec bắt buộc PLAN mục 6: "chính khác phụ")', async () => {
      await expect(
        service.addSecondaryAssignee(taskId, { userId: primaryAssigneeId }, employeeUser, 'own'),
      ).rejects.toThrow(BadRequestException);

      // Đã gọi "1 cổng gác" tasksService.findOne() TRƯỚC khi kiểm tra.
      expect(mockTasksService.findOne).toHaveBeenCalledWith(taskId, employeeUser.id, employeeUser.role, 'own');
      expect(mockUserRepo.findOne).not.toHaveBeenCalled();
    });

    it('ném BadRequestException nếu user không tồn tại hoặc đã bị khoá', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addSecondaryAssignee(taskId, { userId: 99 }, employeeUser, 'own'),
      ).rejects.toThrow(BadRequestException);
      expect(mockSecondaryRepo.findOne).not.toHaveBeenCalled();
    });

    it('ném ConflictException nếu đã là Phụ trách phụ rồi (spec bắt buộc: "unique constraint - không thêm trùng")', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 5, isActive: true });
      mockSecondaryRepo.findOne.mockResolvedValue({ id: 1, taskId, userId: 5 });

      await expect(
        service.addSecondaryAssignee(taskId, { userId: 5 }, employeeUser, 'own'),
      ).rejects.toThrow(ConflictException);
      expect(mockSecondaryRepo.create).not.toHaveBeenCalled();
    });

    it('thêm thành công + trả lại danh sách User đang là phụ trách phụ', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 5, isActive: true, name: 'User 5' });
      mockSecondaryRepo.findOne.mockResolvedValue(null);
      mockSecondaryRepo.save.mockResolvedValue(undefined);
      mockSecondaryRepo.find.mockResolvedValue([{ user: { id: 5, name: 'User 5' } }]);

      const result = await service.addSecondaryAssignee(taskId, { userId: 5 }, employeeUser, 'own');

      expect(mockSecondaryRepo.create).toHaveBeenCalledWith({ taskId, userId: 5, addedById: employeeUser.id });
      expect(mockSecondaryRepo.save).toHaveBeenCalled();
      expect(result).toEqual([{ id: 5, name: 'User 5' }]);
      // ⚠️ FIX BUG THẬT (đợt rà soát audit log toàn bộ - key `userId` từng
      // bị `AuditDiffViewer.ignoreKeys` lọc mất, dòng audit "mất trắng"):
      // giờ log `{ secondaryAssignee: {id, name} }`.
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        taskId,
        employeeUser.id,
        PeriodicTaskAuditAction.SECONDARY_ASSIGNEE_ADDED,
        null,
        { secondaryAssignee: { id: 5, name: 'User 5' } },
      );
    });
  });

  describe('removeSecondaryAssignee', () => {
    it('ném NotFoundException nếu người này không phải Phụ trách phụ của Task', async () => {
      mockSecondaryRepo.findOne.mockResolvedValue(null);

      await expect(
        service.removeSecondaryAssignee(taskId, 5, employeeUser, 'own'),
      ).rejects.toThrow(NotFoundException);
      expect(mockSecondaryRepo.remove).not.toHaveBeenCalled();
    });

    it('gỡ thành công khi tồn tại', async () => {
      mockSecondaryRepo.findOne.mockResolvedValue({ id: 1, taskId, userId: 5 });
      mockSecondaryRepo.remove.mockResolvedValue(undefined);
      // ⚠️ Mới - `removeSecondaryAssignee()` fetch riêng tên user vừa gỡ để
      // dựng audit snapshot sạch.
      mockUserRepo.findOne.mockResolvedValue({ id: 5, name: 'User 5' });

      const result = await service.removeSecondaryAssignee(taskId, 5, employeeUser, 'own');

      expect(mockTasksService.findOne).toHaveBeenCalledWith(taskId, employeeUser.id, employeeUser.role, 'own');
      expect(result).toEqual({ deleted: true });
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        taskId,
        employeeUser.id,
        PeriodicTaskAuditAction.SECONDARY_ASSIGNEE_REMOVED,
        { secondaryAssignee: { id: 5, name: 'User 5' } },
      );
    });
  });

  describe('attachSecondaryAssigneesToList (hiện phụ trách phụ ở mọi view danh sách)', () => {
    it('trả [] và KHÔNG query khi danh sách rỗng', async () => {
      expect(await service.attachSecondaryAssigneesToList([])).toEqual([]);
      expect(mockSecondaryRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('1 query gom cho cả trang, chỉ {id,name}, Task không có phụ -> []', async () => {
      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { taskId: 1, user: { id: 5, name: 'A' } },
          { taskId: 1, user: { id: 6, name: 'B' } },
          { taskId: 2, user: null },
        ]),
      };
      mockSecondaryRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.attachSecondaryAssigneesToList([{ id: 1 }, { id: 2 }, { id: 3 }]);

      expect(qb.where).toHaveBeenCalledWith('sa.taskId IN (:...taskIds)', { taskIds: [1, 2, 3] });
      expect(mockSecondaryRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(result).toEqual([
        { id: 1, secondaryAssignees: [{ id: 5, name: 'A' }, { id: 6, name: 'B' }] },
        { id: 2, secondaryAssignees: [] },
        { id: 3, secondaryAssignees: [] },
      ]);
    });
  });

  describe('attachSecondaryAssignees', () => {
    it('luôn trả về mảng secondaryAssignees (không ẩn theo quyền, khác attachLinkedCustomers Phase 3)', async () => {
      mockSecondaryRepo.find.mockResolvedValue([{ user: { id: 5, name: 'User 5' } }, { user: null }]);

      const task = { id: taskId, title: 'Task A' };
      const result = await service.attachSecondaryAssignees(task);

      // Lọc bỏ dòng có user null (phòng thủ, không nên xảy ra vì onDelete CASCADE).
      expect(result).toEqual({ id: taskId, title: 'Task A', secondaryAssignees: [{ id: 5, name: 'User 5' }] });
    });
  });
});