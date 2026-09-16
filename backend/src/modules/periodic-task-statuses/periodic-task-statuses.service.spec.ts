import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PeriodicTaskStatusesService } from './periodic-task-statuses.service';
import { PeriodicTaskStatus } from '../../database/entities/periodic-task-status.entity';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { AuditService } from '../audit/audit.service';

describe('PeriodicTaskStatusesService', () => {
  let service: PeriodicTaskStatusesService;

  const mockTransactionManager = {
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockStatusRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    manager: {
      transaction: jest.fn(async (cb: (manager: typeof mockTransactionManager) => Promise<void>) => {
        await cb(mockTransactionManager);
      }),
    },
  };
  const mockTaskRepo = {
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const mockAuditService = {
    logAction: jest.fn(),
    logActionAsync: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodicTaskStatusesService,
        { provide: getRepositoryToken(PeriodicTaskStatus), useValue: mockStatusRepo },
        { provide: getRepositoryToken(PeriodicTask), useValue: mockTaskRepo },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<PeriodicTaskStatusesService>(PeriodicTaskStatusesService);
  });

  describe('findAll', () => {
    it('trả về [] ngay, không query đếm nếu chưa có trạng thái nào', async () => {
      mockStatusRepo.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
      expect(mockTaskRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('lấy tất cả trạng thái kèm inUseCount (đếm theo statusId, không phải code)', async () => {
      mockStatusRepo.find.mockResolvedValue([
        { id: 1, code: 'not_started' },
        { id: 2, code: 'completed' },
      ]);
      const qb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ statusId: 1, count: '4' }]),
      };
      mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll();

      expect(result).toEqual([
        { id: 1, code: 'not_started', inUseCount: 4 },
        { id: 2, code: 'completed', inUseCount: 0 },
      ]);
    });
  });

  describe('findOne', () => {
    it('ném NotFoundException nếu id không tồn tại', async () => {
      mockStatusRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });

    it('trả về trạng thái nếu tìm thấy', async () => {
      const status = { id: 1, code: 'not_started' };
      mockStatusRepo.findOne.mockResolvedValue(status);

      const result = await service.findOne(1);

      expect(result).toEqual(status);
    });
  });

  describe('create', () => {
    it('tạo trạng thái mới thành công khi code chưa tồn tại', async () => {
      mockStatusRepo.findOne.mockResolvedValue(null);
      mockStatusRepo.create.mockReturnValue({ code: 'in_review', name: 'Đang xem xét' });
      mockStatusRepo.save.mockResolvedValue({ id: 4, code: 'in_review', name: 'Đang xem xét' });

      const result = await service.create({ code: 'in_review', name: 'Đang xem xét' });

      expect(mockStatusRepo.create).toHaveBeenCalledWith({
        code: 'in_review',
        name: 'Đang xem xét',
        description: null,
        isSystem: false,
        color: '#1890ff',
        sortOrder: 0,
        isDoneState: false,
        isExcludedFromRollup: false,
      });
      expect(result).toEqual({ id: 4, code: 'in_review', name: 'Đang xem xét' });
    });

    it('ném ConflictException nếu code đã tồn tại', async () => {
      mockStatusRepo.findOne.mockResolvedValue({ id: 1, code: 'not_started' });

      await expect(service.create({ code: 'not_started', name: 'X' })).rejects.toThrow(ConflictException);
      expect(mockStatusRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('ném NotFoundException nếu trạng thái không tồn tại', async () => {
      mockStatusRepo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('cho phép đổi tên/màu/isDoneState mà không đổi code', async () => {
      const status = {
        id: 1,
        code: 'not_started',
        name: 'Chưa hoàn thành',
        color: '#faad14',
        isDoneState: false,
        isExcludedFromRollup: false,
        sortOrder: 1,
      };
      mockStatusRepo.findOne.mockResolvedValue(status);
      mockStatusRepo.save.mockImplementation((s) => Promise.resolve(s));

      const result = await service.update(1, { name: 'Chưa xong', color: '#000000', isDoneState: true });

      expect(result.name).toBe('Chưa xong');
      expect(result.color).toBe('#000000');
      expect(result.isDoneState).toBe(true);
      expect(result.code).toBe('not_started');
    });
  });

  describe('remove', () => {
    it('ném NotFoundException nếu id không tồn tại', async () => {
      mockStatusRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });

    it('ném BadRequestException nếu là trạng thái hệ thống', async () => {
      mockStatusRepo.findOne.mockResolvedValue({ id: 1, code: 'not_started', name: 'Chưa hoàn thành', isSystem: true });

      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
      expect(mockTransactionManager.remove).not.toHaveBeenCalled();
    });

    it('ném BadRequestException nếu đang có Task dùng mà KHÔNG truyền fallbackStatusId', async () => {
      mockStatusRepo.findOne.mockResolvedValue({ id: 2, code: 'in_review', name: 'Đang xem xét', isSystem: false });
      mockTaskRepo.count.mockResolvedValue(3);

      await expect(service.remove(2)).rejects.toThrow(BadRequestException);
      expect(mockTransactionManager.remove).not.toHaveBeenCalled();
    });

    it('ném BadRequestException nếu fallbackStatusId trùng với id đang xoá', async () => {
      mockStatusRepo.findOne.mockResolvedValue({ id: 2, code: 'in_review', name: 'Đang xem xét', isSystem: false });
      mockTaskRepo.count.mockResolvedValue(3);

      await expect(service.remove(2, 2)).rejects.toThrow(BadRequestException);
      expect(mockTransactionManager.remove).not.toHaveBeenCalled();
    });

    it('ném BadRequestException nếu fallbackStatusId không tồn tại', async () => {
      mockStatusRepo.findOne
        .mockResolvedValueOnce({ id: 2, code: 'in_review', name: 'Đang xem xét', isSystem: false }) // findOne(id)
        .mockResolvedValueOnce(null); // tìm fallback theo id
      mockTaskRepo.count.mockResolvedValue(3);

      await expect(service.remove(2, 999)).rejects.toThrow(BadRequestException);
      expect(mockTransactionManager.remove).not.toHaveBeenCalled();
    });

    it('xoá thành công khi trạng thái tuỳ chỉnh KHÔNG có Task nào dùng (không cần fallback)', async () => {
      const status = { id: 2, code: 'in_review', name: 'Đang xem xét', isSystem: false };
      mockStatusRepo.findOne.mockResolvedValue(status);
      mockTaskRepo.count.mockResolvedValue(0);

      const result = await service.remove(2);

      expect(mockTaskRepo.count).toHaveBeenCalledWith({ where: { statusId: 2 } });
      expect(mockTransactionManager.update).not.toHaveBeenCalled();
      expect(mockTransactionManager.remove).toHaveBeenCalledWith(PeriodicTaskStatus, status);
      expect(result).toEqual({ deleted: true, reassignedCount: 0 });
    });

    it('chuyển Task sang fallbackStatusId rồi xoá khi đang có Task dùng', async () => {
      const status = { id: 2, code: 'in_review', name: 'Đang xem xét', isSystem: false };
      const fallbackStatus = { id: 1, code: 'not_started', name: 'Chưa hoàn thành', isSystem: true };
      mockStatusRepo.findOne
        .mockResolvedValueOnce(status) // findOne(id)
        .mockResolvedValueOnce(fallbackStatus); // tìm fallback theo id
      mockTaskRepo.count.mockResolvedValue(5);

      const result = await service.remove(2, 1);

      expect(mockTransactionManager.update).toHaveBeenCalledWith(
        PeriodicTask,
        { statusId: 2 },
        { statusId: 1 },
      );
      expect(mockTransactionManager.remove).toHaveBeenCalledWith(PeriodicTaskStatus, status);
      expect(result).toEqual({ deleted: true, reassignedCount: 5 });
    });
  });
});