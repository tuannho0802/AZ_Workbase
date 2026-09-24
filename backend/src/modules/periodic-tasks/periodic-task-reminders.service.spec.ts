import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PeriodicTaskRemindersService } from './periodic-task-reminders.service';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { PeriodicTaskSecondaryAssignee } from '../../database/entities/periodic-task-secondary-assignee.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { PeriodType } from '../../common/enums/period-type.enum';
import * as dateVnUtil from '../../common/utils/date-vn.util';

function makeFakeQueryBuilder(rawRows: any[]) {
  return {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rawRows),
  };
}

describe('PeriodicTaskRemindersService', () => {
  let service: PeriodicTaskRemindersService;
  let mockTaskRepo: { createQueryBuilder: jest.Mock };
  let mockSecondaryAssigneeRepo: { find: jest.Mock };
  let mockNotificationsService: { emitNow: jest.Mock };

  beforeEach(async () => {
    mockTaskRepo = { createQueryBuilder: jest.fn() };
    mockSecondaryAssigneeRepo = { find: jest.fn().mockResolvedValue([]) };
    mockNotificationsService = { emitNow: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodicTaskRemindersService,
        { provide: getRepositoryToken(PeriodicTask), useValue: mockTaskRepo },
        { provide: getRepositoryToken(PeriodicTaskSecondaryAssignee), useValue: mockSecondaryAssigneeRepo },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<PeriodicTaskRemindersService>(PeriodicTaskRemindersService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('trước 18:00 giờ VN -> thoát sớm, KHÔNG query DB', async () => {
    jest.spyOn(dateVnUtil, 'getNowVn').mockReturnValue(new Date('2026-09-24T10:00:00'));
    jest.spyOn(dateVnUtil, 'todayVnStr').mockReturnValue('2026-09-24');

    const result = await service.runDueReminders();

    expect(result).toEqual({
      nowVnHour: 10,
      todayVn: '2026-09-24',
      pastCutoff: false,
      candidatesChecked: 0,
      remindersSent: 0,
      remindedTaskIds: [],
    });
    expect(mockTaskRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('sau 18:00, Task Daily 1 ngày đúng hạn hôm nay -> gửi nhắc, dedupeSuffix = hôm nay', async () => {
    jest.spyOn(dateVnUtil, 'getNowVn').mockReturnValue(new Date('2026-09-24T18:05:00'));
    jest.spyOn(dateVnUtil, 'todayVnStr').mockReturnValue('2026-09-24');

    const qb = makeFakeQueryBuilder([
      {
        id: 1,
        title: 'Việc Daily hôm nay',
        period_type: PeriodType.DAILY,
        period_start_date: '2026-09-24',
        period_end_date: '2026-09-24',
        primary_assignee_id: 7,
      },
      {
        id: 2,
        title: 'Việc Weekly chưa tới ngày nhắc',
        period_type: PeriodType.WEEKLY,
        period_start_date: '2026-09-21',
        period_end_date: '2026-09-27',
        primary_assignee_id: 8,
      },
    ]);
    mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.runDueReminders();

    expect(result.candidatesChecked).toBe(2);
    expect(result.remindersSent).toBe(1);
    expect(result.remindedTaskIds).toEqual([1]);
    expect(mockNotificationsService.emitNow).toHaveBeenCalledTimes(1);
    expect(mockNotificationsService.emitNow).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'task.deadline_reminder',
        actorId: null,
        entity: { type: 'periodic_task', id: 1 },
        dedupeSuffix: '2026-09-24',
        recipients: { task: { primaryAssigneeId: 7, secondaryAssigneeIds: [] } },
      }),
    );
  });

  it('không có Task nào đúng ngày nhắc -> remindersSent=0, không gọi emitNow', async () => {
    jest.spyOn(dateVnUtil, 'getNowVn').mockReturnValue(new Date('2026-09-24T19:00:00'));
    jest.spyOn(dateVnUtil, 'todayVnStr').mockReturnValue('2026-09-24');

    const qb = makeFakeQueryBuilder([
      {
        id: 3,
        title: 'Việc Weekly còn xa',
        period_type: PeriodType.WEEKLY,
        period_start_date: '2026-09-21',
        period_end_date: '2026-09-27',
        primary_assignee_id: 9,
      },
    ]);
    mockTaskRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.runDueReminders();

    expect(result.remindersSent).toBe(0);
    expect(mockNotificationsService.emitNow).not.toHaveBeenCalled();
  });
});
