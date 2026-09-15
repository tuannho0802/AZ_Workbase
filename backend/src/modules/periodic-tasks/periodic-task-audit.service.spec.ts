import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PeriodicTaskAuditService, PeriodicTaskAuditAction } from './periodic-task-audit.service';
import { PeriodicTaskAuditLog } from '../../database/entities/periodic-task-audit-log.entity';

/**
 * Spec cho `PeriodicTaskAuditService` (Phase 7, PLAN mục 2.6 + mục 6).
 *
 * `logActionAsync()` KHÔNG mock `waitUntil()` (đã xác nhận thật ở
 * `WORKFLOW_LOG.md`: `waitUntil()` của `@vercel/functions` là no-op an toàn
 * ngoài môi trường Vercel - `getContext().waitUntil?.()` dùng optional
 * chaining, không throw khi không có context) - để test chạy đúng hành vi
 * thật của Service trong môi trường Jest, không phải hành vi giả lập.
 */
describe('PeriodicTaskAuditService', () => {
  let service: PeriodicTaskAuditService;

  function makeFakeQueryBuilder(overrides: { getManyAndCount?: any } = {}) {
    const qb: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue(overrides.getManyAndCount ?? [[], 0]),
    };
    return qb;
  }

  const mockAuditLogRepo = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodicTaskAuditService,
        {
          provide: getRepositoryToken(PeriodicTaskAuditLog),
          useValue: mockAuditLogRepo,
        },
      ],
    }).compile();

    service = module.get<PeriodicTaskAuditService>(PeriodicTaskAuditService);
  });

  it('nên được định nghĩa', () => {
    expect(service).toBeDefined();
  });

  describe('logAction', () => {
    it('tạo và lưu 1 dòng audit log với đầy đủ field', async () => {
      const created = { id: 1, taskId: 10, userId: 2, action: PeriodicTaskAuditAction.CREATED };
      mockAuditLogRepo.create.mockReturnValue(created);
      mockAuditLogRepo.save.mockResolvedValue(created);

      const result = await service.logAction(
        10,
        2,
        PeriodicTaskAuditAction.CREATED,
        null,
        { name: 'Task A' },
        '127.0.0.1',
        'jest-agent',
      );

      expect(mockAuditLogRepo.create).toHaveBeenCalledWith({
        taskId: 10,
        userId: 2,
        action: PeriodicTaskAuditAction.CREATED,
        oldData: null,
        newData: { name: 'Task A' },
        ipAddress: '127.0.0.1',
        userAgent: 'jest-agent',
      });
      expect(mockAuditLogRepo.save).toHaveBeenCalledWith(created);
      expect(result).toBe(created);
    });

    it('cho phép oldData/newData/ipAddress/userAgent optional (undefined)', async () => {
      mockAuditLogRepo.create.mockReturnValue({});
      mockAuditLogRepo.save.mockResolvedValue({});

      await service.logAction(10, 2, PeriodicTaskAuditAction.LOCKED);

      expect(mockAuditLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 10,
          userId: 2,
          action: PeriodicTaskAuditAction.LOCKED,
          oldData: undefined,
          newData: undefined,
        }),
      );
    });
  });

  describe('logActionAsync', () => {
    it('gọi save() với đúng dữ liệu (fire-and-forget, không throw dù không await)', async () => {
      const created = { id: 5 };
      mockAuditLogRepo.create.mockReturnValue(created);
      mockAuditLogRepo.save.mockResolvedValue(created);

      expect(() =>
        service.logActionAsync(10, 2, PeriodicTaskAuditAction.UPDATED, { a: 1 }, { a: 2 }),
      ).not.toThrow();

      // Đợi microtask của Promise nội bộ (logAction) chạy xong để assert save() đã gọi.
      await new Promise(process.nextTick);

      expect(mockAuditLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 10,
          userId: 2,
          action: PeriodicTaskAuditAction.UPDATED,
          oldData: { a: 1 },
          newData: { a: 2 },
        }),
      );
      expect(mockAuditLogRepo.save).toHaveBeenCalledWith(created);
    });

    it('không throw ra ngoài khi save() lỗi (nuốt lỗi, chỉ log qua Logger)', async () => {
      mockAuditLogRepo.create.mockReturnValue({});
      mockAuditLogRepo.save.mockRejectedValue(new Error('DB down'));

      expect(() =>
        service.logActionAsync(10, 2, PeriodicTaskAuditAction.DELETED, { a: 1 }, null),
      ).not.toThrow();

      // Đợi promise nội bộ reject + catch chạy xong - không có gì để assert thêm
      // ngoài việc process không crash (unhandled rejection sẽ làm Jest fail suite).
      await new Promise(process.nextTick);
      await new Promise(process.nextTick);
    });
  });

  describe('getLogsForTask', () => {
    it('trả về danh sách + metadata phân trang, lọc đúng theo taskId, sắp mới nhất trước', async () => {
      const logs = [
        { id: 2, taskId: 10, action: PeriodicTaskAuditAction.UPDATED },
        { id: 1, taskId: 10, action: PeriodicTaskAuditAction.CREATED },
      ];
      const qb = makeFakeQueryBuilder({ getManyAndCount: [logs, 2] });
      mockAuditLogRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getLogsForTask(10, { page: 1, limit: 20 });

      expect(qb.where).toHaveBeenCalledWith('log.taskId = :taskId', { taskId: 10 });
      expect(qb.orderBy).toHaveBeenCalledWith('log.createdAt', 'DESC');
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('log.user', 'user');
      expect(result).toEqual({
        data: logs,
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('tính đúng skip/take theo page/limit', async () => {
      const qb = makeFakeQueryBuilder({ getManyAndCount: [[], 45] });
      mockAuditLogRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getLogsForTask(10, { page: 3, limit: 20 });

      expect(qb.skip).toHaveBeenCalledWith(40);
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(result.totalPages).toBe(3);
    });

    it('dùng mặc định page=1/limit=20 khi filters rỗng', async () => {
      const qb = makeFakeQueryBuilder({ getManyAndCount: [[], 0] });
      mockAuditLogRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getLogsForTask(10, {});

      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });
});
