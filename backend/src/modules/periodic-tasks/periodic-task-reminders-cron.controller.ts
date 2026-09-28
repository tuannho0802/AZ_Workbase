import { Controller, Get, Headers, Query, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PeriodicTaskRemindersService } from './periodic-task-reminders.service';
import { PeriodicTaskAutoOverdueService } from './periodic-task-auto-overdue.service';

/**
 * ⚠️ CONTROLLER RIÊNG - CỐ Ý KHÔNG dùng chung `PeriodicTasksController` (có
 * `@UseGuards(JwtAuthGuard, PermissionGuard)` ở mức class) - mirror ĐÚNG
 * `zk-device-cron.controller.ts` (đọc JSDoc ở đó để hiểu đầy đủ lý do dùng
 * secret tĩnh thay vì JWT cho endpoint gọi tự động).
 *
 * Cấu hình dịch vụ Uptime (UptimeRobot/cron-job.org...) gọi MỖI 15-30 PHÚT
 * (không chỉ 1 lần/ngày - cần dò đúng thời điểm 18:00 giờ VN, và
 * `runDueReminders()` tự thoát sớm nếu gọi trước 18:00) trỏ tới:
 *   GET https://<domain>/api/periodic-tasks-cron/deadline-reminders?secret=<CRON_SECRET>
 * (hoặc header `x-cron-secret: <CRON_SECRET>`)
 *
 * Mỗi lần gọi endpoint trên còn TỰ CHẠY THÊM `auto-overdue` (đánh dấu quá hạn + khoá Task quá ân hạn 7
 * ngày) nên KHÔNG cần cấu hình thêm job Uptime mới. Có thể gọi riêng:
 *   GET https://<domain>/api/periodic-tasks-cron/auto-overdue?secret=<CRON_SECRET>[&dryRun=true]
 */
@ApiTags('Periodic Tasks Reminders Cron (nội bộ - dùng cho Uptime)')
@Controller('periodic-tasks-cron')
export class PeriodicTaskRemindersCronController {
  private readonly logger = new Logger(PeriodicTaskRemindersCronController.name);

  constructor(
    private readonly remindersService: PeriodicTaskRemindersService,
    private readonly autoOverdueService: PeriodicTaskAutoOverdueService,
  ) {}

  private assertSecret(secretQuery?: string, secretHeader?: string): void {
    const expected = process.env.CRON_SECRET;
    const provided = secretHeader || secretQuery;

    if (!expected) {
      throw new HttpException(
        'CRON_SECRET chưa được cấu hình trên server - liên hệ admin để bật endpoint này.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!provided || provided !== expected) {
      throw new HttpException('Secret không hợp lệ.', HttpStatus.UNAUTHORIZED);
    }
  }

  @Get('auto-overdue')
  @ApiOperation({
    summary:
      'Tự đánh dấu quá hạn (overdue_marked_at) + khoá Task chưa xong đã quá ân hạn 7 ngày. `dryRun=true` chỉ đếm, không ghi. Yêu cầu `secret`/`x-cron-secret` khớp CRON_SECRET.',
  })
  @ApiQuery({ name: 'secret', required: false })
  @ApiQuery({ name: 'dryRun', required: false, description: 'true = chỉ xem trước, không ghi DB' })
  async runAutoOverdue(
    @Query('secret') secretQuery?: string,
    @Query('dryRun') dryRun?: string,
    @Headers('x-cron-secret') secretHeader?: string,
  ) {
    this.assertSecret(secretQuery, secretHeader);
    try {
      return await this.autoOverdueService.runSweep({ dryRun: dryRun === 'true' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Cron] Auto overdue thất bại: ${message}`);
      throw new HttpException(`Chạy auto overdue thất bại: ${message}`, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  @Get('deadline-reminders')
  @ApiOperation({
    summary:
      'CHỈ dùng cho dịch vụ Uptime bên ngoài gọi tự động mỗi 15-30 phút - kiểm tra và gửi nhắc hạn (18:00 giờ VN) cho Task Daily/Weekly chưa hoàn thành. Yêu cầu query param `secret` hoặc header `x-cron-secret` khớp biến môi trường CRON_SECRET.',
  })
  @ApiQuery({ name: 'secret', required: false, description: 'CRON_SECRET - có thể truyền qua query hoặc header x-cron-secret' })
  async runDeadlineReminders(
    @Query('secret') secretQuery?: string,
    @Headers('x-cron-secret') secretHeader?: string,
  ) {
    this.assertSecret(secretQuery, secretHeader);

    // Việc dọn Task quá ân hạn chạy TRƯỚC mốc 18:00 của nhắc hạn (thoát sớm) và không được làm hỏng nhắc hạn nếu lỗi.
    let autoOverdue: Awaited<ReturnType<PeriodicTaskAutoOverdueService['runSweep']>> | { error: string } | undefined;
    try {
      autoOverdue = await this.autoOverdueService.runSweep();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Cron] Auto overdue (kèm nhắc hạn) thất bại: ${message}`);
      autoOverdue = { error: message };
    }

    try {
      const result = await this.remindersService.runDueReminders();
      this.logger.log(
        `[Cron] Nhắc hạn (${result.todayVn} ${result.nowVnHour}h): checked=${result.candidatesChecked}, sent=${result.remindersSent}`,
      );
      return { ...result, autoOverdue };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Cron] Nhắc hạn thất bại: ${message}`);
      throw new HttpException(`Chạy nhắc hạn thất bại: ${message}`, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
