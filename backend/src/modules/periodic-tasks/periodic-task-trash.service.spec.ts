import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { PeriodicTaskAuditLog } from '../../database/entities/periodic-task-audit-log.entity';
import { AuditService } from '../audit/audit.service';
import { PeriodicTaskTrashService } from './periodic-task-trash.service';
import { PeriodicTaskAuditService } from './periodic-task-audit.service';

describe('PeriodicTaskTrashService', () => {
  let service: PeriodicTaskTrashService;

  const deleteQb: any = {};
  deleteQb.delete = jest.fn().mockReturnValue(deleteQb);
  deleteQb.where = jest.fn().mockReturnValue(deleteQb);
  deleteQb.andWhere = jest.fn().mockReturnValue(deleteQb);
  deleteQb.restore = jest.fn().mockReturnValue(deleteQb);
  deleteQb.execute = jest.fn();

  const listQb: any = {};
  for (const m of ['withDeleted', 'leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take']) {
    listQb[m] = jest.fn().mockReturnValue(listQb);
  }
  listQb.getManyAndCount = jest.fn();

  const mockTaskRepo = { find: jest.fn(), createQueryBuilder: jest.fn() };
  const mockAuditLogRepo = { find: jest.fn() };
  const mockAuditService = { logAction: jest.fn() };
  const mockTaskAudit = { logActionAsync: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTaskRepo.createQueryBuilder.mockImplementation((alias?: string) => (alias ? listQb : deleteQb));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodicTaskTrashService,
        { provide: getRepositoryToken(PeriodicTask), useValue: mockTaskRepo },
        { provide: getRepositoryToken(PeriodicTaskAuditLog), useValue: mockAuditLogRepo },
        { provide: AuditService, useValue: mockAuditService },
        { provide: PeriodicTaskAuditService, useValue: mockTaskAudit },
      ],
    }).compile();
    service = module.get(PeriodicTaskTrashService);
  });

  describe('getTrash', () => {
    it('chỉ lấy Task đã xoá mềm, gắn người xoá từ log `deleted`, KHÔNG lộ field thừa', async () => {
      listQb.getManyAndCount.mockResolvedValue([
        [{ id: 5, title: 'A', periodType: 'daily', deletedAt: new Date('2026-09-01'), primaryAssignee: { id: 2, name: 'B', password: 'x' } }],
        1,
      ]);
      mockAuditLogRepo.find.mockResolvedValue([{ taskId: 5, user: { id: 9, name: 'Admin' } }]);

      const res = await service.getTrash({ page: 1, limit: 20, search: ' A ' });

      expect(listQb.where).toHaveBeenCalledWith('task.deletedAt IS NOT NULL');
      expect(listQb.andWhere).toHaveBeenCalledWith('task.title LIKE :search', { search: '%A%' });
      expect(res.total).toBe(1);
      expect(res.data[0].deletedBy).toEqual({ id: 9, name: 'Admin' });
      expect(res.data[0].primaryAssignee).toEqual({ id: 2, name: 'B' });
    });

    it('trash rỗng -> không query log', async () => {
      listQb.getManyAndCount.mockResolvedValue([[], 0]);
      const res = await service.getTrash({});
      expect(res.data).toEqual([]);
      expect(mockAuditLogRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('ném NotFoundException nếu không có Task nào trong thùng rác khớp', async () => {
      mockTaskRepo.find.mockResolvedValue([]);
      await expect(service.restore([1], 9)).rejects.toThrow(NotFoundException);
      expect(deleteQb.restore).not.toHaveBeenCalled();
    });

    it('chỉ khôi phục Task đang xoá mềm, báo số bỏ qua và ghi log `restored` cho từng Task', async () => {
      mockTaskRepo.find.mockResolvedValue([{ id: 1, title: 'T1' }, { id: 3, title: 'T3' }]);
      deleteQb.execute.mockResolvedValue({ affected: 2 });

      const res = await service.restore([1, 2, 3], 9);

      expect(deleteQb.restore).toHaveBeenCalled();
      expect(deleteQb.where).toHaveBeenCalledWith('id IN (:...ids)', { ids: [1, 3] });
      expect(deleteQb.andWhere).toHaveBeenCalledWith('deleted_at IS NOT NULL');
      expect(res).toEqual({ restored: 2, skipped: 1 });
      expect(mockTaskAudit.logActionAsync).toHaveBeenCalledTimes(2);
      expect(mockTaskAudit.logActionAsync).toHaveBeenCalledWith(1, 9, 'restored', null, { title: 'T1' });
    });
  });

  describe('hardDelete', () => {
    it('ném NotFoundException nếu không có Task nào trong thùng rác khớp', async () => {
      mockTaskRepo.find.mockResolvedValue([]);
      await expect(service.hardDelete([1, 2], 9)).rejects.toThrow(NotFoundException);
      expect(deleteQb.execute).not.toHaveBeenCalled();
    });

    it('chỉ xoá Task đã xoá mềm, báo số bỏ qua và ghi audit', async () => {
      mockTaskRepo.find.mockResolvedValue([{ id: 1, title: 'T1' }]);
      deleteQb.execute.mockResolvedValue({ affected: 1 });

      const res = await service.hardDelete([1, 2, 2], 9);

      expect(deleteQb.where).toHaveBeenCalledWith('id IN (:...ids)', { ids: [1] });
      expect(deleteQb.andWhere).toHaveBeenCalledWith('deleted_at IS NOT NULL');
      expect(res).toEqual({ deleted: 1, skipped: 1 });
      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        9, 'HARD_DELETE_PERIODIC_TASKS', 'periodic_task', 0,
        { count: 1, tasks: [{ id: 1, title: 'T1' }] }, null,
      );
    });
  });

  describe('emptyTrash', () => {
    it('thùng rác rỗng -> không xoá, không ghi audit', async () => {
      mockTaskRepo.find.mockResolvedValue([]);
      expect(await service.emptyTrash(9)).toEqual({ deleted: 0 });
      expect(deleteQb.execute).not.toHaveBeenCalled();
      expect(mockAuditService.logAction).not.toHaveBeenCalled();
    });

    it('xoá toàn bộ Task đã xoá mềm và ghi audit', async () => {
      mockTaskRepo.find.mockResolvedValue([{ id: 1, title: 'A' }, { id: 2, title: 'B' }]);
      deleteQb.execute.mockResolvedValue({ affected: 2 });

      expect(await service.emptyTrash(9)).toEqual({ deleted: 2 });
      expect(deleteQb.where).toHaveBeenCalledWith('deleted_at IS NOT NULL');
      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        9, 'EMPTY_PERIODIC_TASK_TRASH', 'periodic_task', 0, expect.objectContaining({ count: 2 }), null,
      );
    });
  });
});
