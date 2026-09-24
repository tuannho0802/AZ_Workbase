import { Controller, Get, Headers, Query, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PeriodicTaskRemindersService } from './periodic-task-reminders.service';

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
 */
@ApiTags('Periodic Tasks Reminders Cron (nội bộ - dùng cho Uptime)')
@Controller('periodic-tasks-cron')
export class PeriodicTaskRemindersCronController {
  private readonly logger = new Logger(PeriodicTaskRemindersCronController.name);

  constructor(private readonly remindersService: PeriodicTaskRemindersService) {}

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

    try {
      const result = await this.remindersService.runDueReminders();
      this.logger.log(
        `[Cron] Nhắc hạn (${result.todayVn} ${result.nowVnHour}h): checked=${result.candidatesChecked}, sent=${result.remindersSent}`,
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Cron] Nhắc hạn thất bại: ${message}`);
      throw new HttpException(`Chạy nhắc hạn thất bại: ${message}`, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
