import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { PeriodicTaskSecondaryAssignee } from '../../database/entities/periodic-task-secondary-assignee.entity';
import { PeriodType } from '../../common/enums/period-type.enum';
import { getNowVn, todayVnStr } from '../../common/utils/date-vn.util';
import { computeReminderDate } from './helpers/deadline-reminder.helper';
import { NotificationsService } from '../notifications/notifications.service';

export interface RunDueRemindersResult {
  nowVnHour: number;
  todayVn: string;
  /** Đã qua 18:00 giờ VN chưa - dưới giờ này thì KHÔNG check gì cả (thoát sớm). */
  pastCutoff: boolean;
  candidatesChecked: number;
  remindersSent: number;
  remindedTaskIds: number[];
}

/**
 * PeriodicTaskRemindersService - "nhắc nhở Auto về Deadline" (yêu cầu chủ dự
 * án, đi kèm PLAN Hiệu suất công việc). Quy tắc NGÀY cần nhắc xem
 * `helpers/deadline-reminder.helper.ts` (Daily/Weekly - Monthly/Yearly CHƯA
 * có quy tắc, cố tình bỏ qua).
 *
 * ⚠️ Dự án chạy Vercel serverless - KHÔNG có tiến trình nào sống đủ lâu để
 * tự kích hoạt cron nội bộ (đã xác nhận ở PLAN mục 2.1, mirror
 * `AuditModule`/`ZkDeviceService`). Vì vậy method `runDueReminders()` ở đây
 * KHÔNG tự chạy - phải được gọi định kỳ (vd mỗi 15-30 phút) bởi 1 dịch vụ
 * Uptime BÊN NGOÀI qua endpoint bảo vệ bằng `CRON_SECRET`, xem
 * `PeriodicTaskRemindersCronController` (mirror ĐÚNG
 * `zk-device-cron.controller.ts`).
 *
 * Idempotent theo NGÀY: `dedupeSuffix` truyền cho `NotificationsService.emit()`
 * là `todayVn` - gọi lặp lại nhiều lần trong cùng 1 ngày (dù trước hay sau
 * 18:00) chỉ tạo ĐÚNG 1 dòng thông báo / Task (INSERT ... ON DUPLICATE KEY,
 * xem `notifications.service.ts::buildInsertSql`).
 */
@Injectable()
export class PeriodicTaskRemindersService {
  private readonly logger = new Logger(PeriodicTaskRemindersService.name);

  constructor(
    @InjectRepository(PeriodicTask)
    private readonly taskRepo: Repository<PeriodicTask>,
    @InjectRepository(PeriodicTaskSecondaryAssignee)
    private readonly secondaryAssigneeRepo: Repository<PeriodicTaskSecondaryAssignee>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async runDueReminders(): Promise<RunDueRemindersResult> {
    const now = getNowVn();
    const todayVn = todayVnStr();
    const nowVnHour = now.getHours();

    // Chỉ nhắc TỪ 18:00 giờ VN trở đi (yêu cầu chủ dự án: "Nhắc trước 18h00
    // ngày hiện tại" / "trước 18h00 trước 1 ngày") - trước giờ này chưa cần
    // gọi query gì, thoát sớm cho nhẹ (dịch vụ Uptime có thể gọi mỗi 15-30
    // phút cả ngày).
    if (nowVnHour < 18) {
      return { nowVnHour, todayVn, pastCutoff: false, candidatesChecked: 0, remindersSent: 0, remindedTaskIds: [] };
    }

    // Ứng viên: CHƯA xong (status.is_done_state = FALSE), period_end_date
    // CHƯA quá xa trong quá khứ (>= hôm nay - Task đã trễ hạn từ lâu không
    // cần nhắc lại mỗi ngày nữa, tránh spam vô hạn).
    const candidates = await this.taskRepo
      .createQueryBuilder('task')
      .innerJoin('task.status', 'status')
      .where('task.deletedAt IS NULL')
      .andWhere('task.periodType IN (:...types)', { types: [PeriodType.DAILY, PeriodType.WEEKLY] })
      .andWhere('status.isDoneState = FALSE')
      .andWhere('task.periodEndDate >= :todayVn', { todayVn })
      .select([
        'task.id AS id',
        'task.title AS title',
        'task.periodType AS period_type',
        'task.periodStartDate AS period_start_date',
        'task.periodEndDate AS period_end_date',
        'task.primaryAssigneeId AS primary_assignee_id',
      ])
      .getRawMany<{
        id: number;
        title: string;
        period_type: PeriodType;
        period_start_date: string;
        period_end_date: string;
        primary_assignee_id: number;
      }>();

    const dueTasks = candidates.filter((c) => {
      const reminderDate = computeReminderDate({
        periodType: c.period_type,
        periodStartDate: String(c.period_start_date).slice(0, 10),
        periodEndDate: String(c.period_end_date).slice(0, 10),
      });
      return reminderDate === todayVn;
    });

    if (dueTasks.length === 0) {
      return { nowVnHour, todayVn, pastCutoff: true, candidatesChecked: candidates.length, remindersSent: 0, remindedTaskIds: [] };
    }

    const dueTaskIds = dueTasks.map((t) => t.id);
    const secondaryRows = await this.secondaryAssigneeRepo.find({
      where: { taskId: In(dueTaskIds) },
      select: { taskId: true, userId: true },
    });
    const secondaryByTask = new Map<number, number[]>();
    for (const s of secondaryRows) {
      const list = secondaryByTask.get(s.taskId) ?? [];
      list.push(s.userId);
      secondaryByTask.set(s.taskId, list);
    }

    for (const t of dueTasks) {
      try {
        await this.notificationsService.emitNow({
          type: 'task.deadline_reminder',
          actorId: null,
          entity: { type: 'periodic_task', id: t.id },
          entityName: t.title,
          recipients: {
            task: {
              primaryAssigneeId: t.primary_assignee_id,
              secondaryAssigneeIds: secondaryByTask.get(t.id) ?? [],
            },
          },
          dedupeSuffix: todayVn,
        });
      } catch (error) {
        const err = error as Error;
        this.logger.error(`Gửi nhắc hạn thất bại (taskId=${t.id}): ${err?.message}`, err?.stack);
      }
    }

    return {
      nowVnHour,
      todayVn,
      pastCutoff: true,
      candidatesChecked: candidates.length,
      remindersSent: dueTasks.length,
      remindedTaskIds: dueTaskIds,
    };
  }
}
