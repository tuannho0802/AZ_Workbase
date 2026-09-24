import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PeriodicTaskPerformanceService, LATE_GRACE_DAYS } from './periodic-task-performance.service';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { PeriodicTaskChecklistItem } from '../../database/entities/periodic-task-checklist-item.entity';
import { PeriodicTaskStatus } from '../../database/entities/periodic-task-status.entity';
import { PeriodicTaskAuditLog } from '../../database/entities/periodic-task-audit-log.entity';
import { User } from '../../database/entities/user.entity';
import { PermissionsService } from '../permissions/permissions.service';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { Role } from '../../common/enums/role.enum';
import * as dateVnUtil from '../../common/utils/date-vn.util';

/**
 * Test rule ân hạn 7 ngày CHỐT LẠI 2026-09-24 (thay hoàn toàn quy tắc
 * `completed_at` cũ - xem JSDoc class `PeriodicTaskPerformanceService`):
 * Task "xong" = lần ĐẦU TIÊN đạt status `code='in_review'` HOẶC
 * `is_done_state=true`, lấy mốc từ `periodic_task_audit_logs` (action
 * `status_changed`), so với `period_end_date + LATE_GRACE_DAYS` (7 ngày).
 */
function makeQb(rawRows: any[]) {
  return {
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rawRows),
  };
}

describe('PeriodicTaskPerformanceService - grace period 7 ngày', () => {
  let service: PeriodicTaskPerformanceService;
  let mockTaskRepo: { createQueryBuilder: jest.Mock };
  let mockChecklistRepo: { createQueryBuilder: jest.Mock };
  let mockStatusRepo: { find: jest.Mock };
  let mockAuditLogRepo: { find: jest.Mock };
  let mockUserRepo: { find: jest.Mock };
  let mockPermissionsService: { hasPermission: jest.Mock };

  const ADMIN_USER = { id: 1, role: Role.ADMIN, isRootAdmin: true };

  const STATUSES = [
    { id: 10, code: 'not_started', isDoneState: false },
    { id: 20, code: 'completed', isDoneState: true },
    { id: 30, code: 'not_completed', isDoneState: false },
    { id: 40, code: 'in_review', isDoneState: false },
  ];

  beforeEach(async () => {
    mockTaskRepo = { createQueryBuilder: jest.fn() };
    mockChecklistRepo = { createQueryBuilder: jest.fn().mockReturnValue(makeQb([])) };
    mockStatusRepo = { find: jest.fn().mockResolvedValue(STATUSES) };
    mockAuditLogRepo = { find: jest.fn().mockResolvedValue([]) };
    mockUserRepo = { find: jest.fn().mockResolvedValue([{ id: 7, name: 'Nhân viên A' }]) };
    mockPermissionsService = { hasPermission: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodicTaskPerformanceService,
        { provide: getRepositoryToken(PeriodicTask), useValue: mockTaskRepo },
        { provide: getRepositoryToken(PeriodicTaskChecklistItem), useValue: mockChecklistRepo },
        { provide: getRepositoryToken(PeriodicTaskStatus), useValue: mockStatusRepo },
        { provide: getRepositoryToken(PeriodicTaskAuditLog), useValue: mockAuditLogRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: PermissionsService, useValue: mockPermissionsService },
      ],
    }).compile();

    service = module.get<PeriodicTaskPerformanceService>(PeriodicTaskPerformanceService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('LATE_GRACE_DAYS = 7 (đúng chốt nghiệp vụ 2026-09-24)', () => {
    expect(LATE_GRACE_DAYS).toBe(7);
  });

  it('chuyển sang completed TRONG vòng 7 ngày sau hạn -> completedOnTime, KHÔNG late', async () => {
    jest.spyOn(dateVnUtil, 'todayVnStr').mockReturnValue('2026-09-24');

    const taskRows = [
      {
        task_id: 1,
        primary_assignee_id: 7,
        status_id: 20, // completed
        period_end_date: '2026-09-10',
        created_at: '2026-09-01T00:00:00.000Z',
        is_excluded_from_rollup: 0,
      },
    ];
    mockTaskRepo.createQueryBuilder.mockReturnValue(makeQb(taskRows));

    // Đúng NGÀY BIÊN của ân hạn: 2026-09-10 + 7 = 2026-09-17.
    mockAuditLogRepo.find.mockResolvedValue([
      { taskId: 1, newData: { status: { id: 20 } }, createdAt: new Date('2026-09-17T10:00:00.000Z') },
    ]);

    const result = await service.getSummary({}, ADMIN_USER as any);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].completedOnTime).toBe(1);
    expect(result.rows[0].completedLate).toBe(0);
  });

  it('chuyển sang completed SAU 7 ngày ân hạn -> completedLate', async () => {
    jest.spyOn(dateVnUtil, 'todayVnStr').mockReturnValue('2026-09-24');

    const taskRows = [
      {
        task_id: 2,
        primary_assignee_id: 7,
        status_id: 20,
        period_end_date: '2026-09-10',
        created_at: '2026-09-01T00:00:00.000Z',
        is_excluded_from_rollup: 0,
      },
    ];
    mockTaskRepo.createQueryBuilder.mockReturnValue(makeQb(taskRows));

    // 2026-09-18 > 2026-09-17 (biên ân hạn) -> TRỄ.
    mockAuditLogRepo.find.mockResolvedValue([
      { taskId: 2, newData: { status: { id: 20 } }, createdAt: new Date('2026-09-18T00:00:00.000Z') },
    ]);

    const result = await service.getSummary({}, ADMIN_USER as any);

    expect(result.rows[0].completedOnTime).toBe(0);
    expect(result.rows[0].completedLate).toBe(1);
  });

  it('chuyển sang in_review (chưa completed) TRONG hạn ân hạn -> tính là completedOnTime (đúng ý "in_review HOẶC completed")', async () => {
    jest.spyOn(dateVnUtil, 'todayVnStr').mockReturnValue('2026-09-24');

    const taskRows = [
      {
        task_id: 3,
        primary_assignee_id: 7,
        status_id: 40, // in_review - is_done_state=false nhưng vẫn qualify
        period_end_date: '2026-09-10',
        created_at: '2026-09-01T00:00:00.000Z',
        is_excluded_from_rollup: 0,
      },
    ];
    mockTaskRepo.createQueryBuilder.mockReturnValue(makeQb(taskRows));
    mockAuditLogRepo.find.mockResolvedValue([
      { taskId: 3, newData: { status: { id: 40 } }, createdAt: new Date('2026-09-12T00:00:00.000Z') },
    ]);

    const result = await service.getSummary({}, ADMIN_USER as any);

    expect(result.rows[0].completedOnTime).toBe(1);
  });

  it('CHƯA từng đạt in_review/completed và hôm nay đã qua khỏi hạn ân hạn -> overdueNotCompleted', async () => {
    jest.spyOn(dateVnUtil, 'todayVnStr').mockReturnValue('2026-09-24'); // 2026-09-24 > 2026-09-17 (10/09 + 7)

    const taskRows = [
      {
        task_id: 4,
        primary_assignee_id: 7,
        status_id: 10, // not_started - chưa từng đổi
        period_end_date: '2026-09-10',
        created_at: '2026-09-01T00:00:00.000Z',
        is_excluded_from_rollup: 0,
      },
    ];
    mockTaskRepo.createQueryBuilder.mockReturnValue(makeQb(taskRows));
    mockAuditLogRepo.find.mockResolvedValue([]); // chưa từng đổi status

    const result = await service.getSummary({}, ADMIN_USER as any);

    expect(result.rows[0].overdueNotCompleted).toBe(1);
    expect(result.rows[0].pendingFuture).toBe(0);
  });

  it('CHƯA đạt in_review/completed nhưng vẫn còn TRONG 7 ngày ân hạn -> pendingFuture (CHƯA bị tính thiếu sót)', async () => {
    // period_end_date=2026-09-20 -> biên ân hạn 2026-09-27, hôm nay 2026-09-24 vẫn còn trong hạn.
    jest.spyOn(dateVnUtil, 'todayVnStr').mockReturnValue('2026-09-24');

    const taskRows = [
      {
        task_id: 5,
        primary_assignee_id: 7,
        status_id: 10,
        period_end_date: '2026-09-20',
        created_at: '2026-09-01T00:00:00.000Z',
        is_excluded_from_rollup: 0,
      },
    ];
    mockTaskRepo.createQueryBuilder.mockReturnValue(makeQb(taskRows));
    mockAuditLogRepo.find.mockResolvedValue([]);

    const result = await service.getSummary({}, ADMIN_USER as any);

    expect(result.rows[0].pendingFuture).toBe(1);
    expect(result.rows[0].overdueNotCompleted).toBe(0);
  });

  it('Task tạo THẲNG với statusId đã qualify, KHÔNG có audit log status_changed nào -> fallback dùng task.createdAt', async () => {
    jest.spyOn(dateVnUtil, 'todayVnStr').mockReturnValue('2026-09-24');

    const taskRows = [
      {
        task_id: 6,
        primary_assignee_id: 7,
        status_id: 20, // completed NGAY từ lúc tạo (VD tạo qua API kèm statusId)
        period_end_date: '2026-09-10',
        created_at: '2026-09-12T00:00:00.000Z', // trong hạn ân hạn (<= 2026-09-17)
        is_excluded_from_rollup: 0,
      },
    ];
    mockTaskRepo.createQueryBuilder.mockReturnValue(makeQb(taskRows));
    mockAuditLogRepo.find.mockResolvedValue([]); // KHÔNG có log status_changed nào

    const result = await service.getSummary({}, ADMIN_USER as any);

    expect(result.rows[0].completedOnTime).toBe(1);
  });

  it('is_excluded_from_rollup=true -> loại khỏi cả tử số lẫn mẫu số, KHÔNG xuất hiện trong rows', async () => {
    jest.spyOn(dateVnUtil, 'todayVnStr').mockReturnValue('2026-09-24');

    const taskRows = [
      {
        task_id: 7,
        primary_assignee_id: 9,
        status_id: 30, // not_completed, bị loại rollup
        period_end_date: '2026-09-10',
        created_at: '2026-09-01T00:00:00.000Z',
        is_excluded_from_rollup: 1,
      },
    ];
    mockTaskRepo.createQueryBuilder.mockReturnValue(makeQb(taskRows));
    mockUserRepo.find.mockResolvedValue([]);

    const result = await service.getSummary({}, ADMIN_USER as any);

    expect(result.rows).toHaveLength(0);
    // Task bị loại rollup -> KHÔNG cần query audit log cho nó (tối ưu, không bắt buộc nhưng đúng ý JSDoc).
  });

  it('không có status nào qualify trong DB (VD chưa seed) -> mọi Task coi như chưa đạt in_review/done', async () => {
    jest.spyOn(dateVnUtil, 'todayVnStr').mockReturnValue('2026-09-24');
    mockStatusRepo.find.mockResolvedValue([{ id: 10, code: 'not_started', isDoneState: false }]);

    const taskRows = [
      {
        task_id: 8,
        primary_assignee_id: 7,
        status_id: 10,
        period_end_date: '2026-09-01',
        created_at: '2026-09-01T00:00:00.000Z',
        is_excluded_from_rollup: 0,
      },
    ];
    mockTaskRepo.createQueryBuilder.mockReturnValue(makeQb(taskRows));

    const result = await service.getSummary({}, ADMIN_USER as any);

    expect(result.rows[0].overdueNotCompleted).toBe(1);
    expect(mockAuditLogRepo.find).not.toHaveBeenCalled(); // early-return khi qualifyingIds rỗng
  });
});
