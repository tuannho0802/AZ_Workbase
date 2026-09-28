import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { todayVnStr } from '../../common/utils/date-vn.util';
import { addDaysToDateString } from './helpers/list-window.helper';
import { AUTO_LOCK_NOTE, COMPLETED_STATUS_CODES } from './helpers/overdue.helper';
import { LATE_GRACE_DAYS } from './periodic-task-performance.service';

export interface AutoOverdueSweepResult {
  todayVn: string;
  /** Task có `period_end_date` < mốc này là đã QUÁ ÂN HẠN. */
  cutoffPeriodEnd: string;
  dryRun: boolean;
  candidates: number;
  markedOverdue: number;
  locked: number;
  markedTaskIds: number[];
  lockedTaskIds: number[];
}

const CHUNK = 500;

/**
 * Tự động xử lý Task QUÁ ÂN HẠN (hôm nay > `period_end_date` + `LATE_GRACE_DAYS` ngày, giờ VN) mà
 * CHƯA đạt in_review/done:
 *  1. Set `overdue_marked_at` (nếu đang null) - `overdue_marked_by_id` để null = do hệ thống.
 *  2. Khoá Task (`is_locked`) nếu chưa khoá - `locked_by_id` null + `lock_note = AUTO_LOCK_NOTE`.
 *     Task đã khoá tay được GIỮ NGUYÊN (không ghi đè người khoá/ghi chú).
 *
 * ⚠️ Vercel serverless -> KHÔNG có cron nội bộ; method này phải được gọi định kỳ từ bên ngoài, xem
 * `PeriodicTaskRemindersCronController` (endpoint `auto-overdue`, đồng thời được gọi kèm mỗi lần Uptime
 * ping `deadline-reminders`). Idempotent: chạy lại không đổi gì thêm. Task đã xong KHÔNG bị đụng tới.
 *
 * Không ghi `periodic_task_audit_logs` vì bảng đó bắt buộc `user_id` (không có "người dùng hệ thống");
 * kết quả được ghi Logger + trả về danh sách id.
 */
@Injectable()
export class PeriodicTaskAutoOverdueService {
  private readonly logger = new Logger(PeriodicTaskAutoOverdueService.name);

  constructor(
    @InjectRepository(PeriodicTask)
    private readonly taskRepo: Repository<PeriodicTask>,
  ) {}

  async runSweep(options: { dryRun?: boolean } = {}): Promise<AutoOverdueSweepResult> {
    const dryRun = options.dryRun === true;
    const todayVn = todayVnStr();
    // hôm nay > end + grace  <=>  end < hôm nay - grace
    const cutoffPeriodEnd = addDaysToDateString(todayVn, -LATE_GRACE_DAYS);

    const candidates = await this.taskRepo
      .createQueryBuilder('task')
      .leftJoin('task.status', 'status')
      .select(['task.id', 'task.overdueMarkedAt', 'task.isLocked'])
      .where('task.deletedAt IS NULL')
      .andWhere('task.periodEndDate < :cutoff', { cutoff: cutoffPeriodEnd })
      .andWhere('(status.code IS NULL OR status.code NOT IN (:...doneCodes))', { doneCodes: [...COMPLETED_STATUS_CODES] })
      .andWhere('(task.overdueMarkedAt IS NULL OR task.isLocked = :notLocked)', { notLocked: 0 })
      .getMany();

    const toMark = candidates.filter((t) => t.overdueMarkedAt == null).map((t) => t.id);
    const toLock = candidates.filter((t) => !t.isLocked).map((t) => t.id);

    if (!dryRun) {
      const now = new Date();
      for (let i = 0; i < toMark.length; i += CHUNK) {
        await this.taskRepo
          .createQueryBuilder()
          .update(PeriodicTask)
          .set({ overdueMarkedAt: now, overdueMarkedById: null })
          .whereInIds(toMark.slice(i, i + CHUNK))
          .execute();
      }
      for (let i = 0; i < toLock.length; i += CHUNK) {
        await this.taskRepo
          .createQueryBuilder()
          .update(PeriodicTask)
          .set({ isLocked: true, lockedAt: now, lockedById: null, lockNote: AUTO_LOCK_NOTE })
          .whereInIds(toLock.slice(i, i + CHUNK))
          .execute();
      }
      if (toMark.length || toLock.length) {
        this.logger.log(`[AutoOverdue] ${todayVn}: đánh dấu quá hạn ${toMark.length}, khoá ${toLock.length} Task (quá ân hạn ${LATE_GRACE_DAYS} ngày).`);
      }
    }

    return {
      todayVn,
      cutoffPeriodEnd,
      dryRun,
      candidates: candidates.length,
      markedOverdue: toMark.length,
      locked: toLock.length,
      markedTaskIds: toMark,
      lockedTaskIds: toLock,
    };
  }
}
