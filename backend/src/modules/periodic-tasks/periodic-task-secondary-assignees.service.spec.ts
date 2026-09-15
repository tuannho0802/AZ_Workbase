import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PeriodicTaskSecondaryAssigneesService } from './periodic-task-secondary-assignees.service';
import { PeriodicTasksService } from './periodic-tasks.service';
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
  };
  const mockUserRepo = {
    findOne: jest.fn(),
  };
  const mockTasksService = {
    findOne: jest.fn(),
    assertEditableWhenLocked: jest.fn(),
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
      mockUserRepo.findOne.mockResolvedValue({ id: 5, isActive: true });
      mockSecondaryRepo.findOne.mockResolvedValue(null);
      mockSecondaryRepo.save.mockResolvedValue(undefined);
      mockSecondaryRepo.find.mockResolvedValue([{ user: { id: 5, name: 'User 5' } }]);

      const result = await service.addSecondaryAssignee(taskId, { userId: 5 }, employeeUser, 'own');

      expect(mockSecondaryRepo.create).toHaveBeenCalledWith({ taskId, userId: 5, addedById: employeeUser.id });
      expect(mockSecondaryRepo.save).toHaveBeenCalled();
      expect(result).toEqual([{ id: 5, name: 'User 5' }]);
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

      const result = await service.removeSecondaryAssignee(taskId, 5, employeeUser, 'own');

      expect(mockTasksService.findOne).toHaveBeenCalledWith(taskId, employeeUser.id, employeeUser.role, 'own');
      expect(result).toEqual({ deleted: true });
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