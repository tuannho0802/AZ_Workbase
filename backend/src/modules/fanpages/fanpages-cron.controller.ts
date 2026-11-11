import { Controller, Get, Headers, HttpException, HttpStatus, Logger, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FanpageRemindersService } from './fanpage-reminders.service';

/**
 * ⚠️ CONTROLLER RIÊNG - CỐ Ý KHÔNG dùng chung `FanpagesController` (có `@UseGuards(JwtAuthGuard, PermissionGuard)` ở mức class):
 * endpoint này do dịch vụ Uptime gọi tự động nên xác thực bằng secret tĩnh `CRON_SECRET`, KHÔNG phải JWT - mirror ĐÚNG
 * `PeriodicTaskRemindersCronController` (đọc JSDoc ở đó để hiểu lý do; Vercel Hobby đã dùng đủ 2/2 cron nên KHÔNG thêm vào `vercel.json`).
 *
 * Cấu hình dịch vụ Uptime (UptimeRobot/cron-job.org...) gọi MỖI 30 PHÚT, nên đặt lịch chỉ trong khung 17:00-23:30 giờ VN
 * (cron-job.org hỗ trợ; trước 17:00 `runDueReminders()` tự thoát sớm nhưng vẫn phải khởi động Nest/DB nếu instance nguội):
 *   GET https://<domain>/api/fanpages-cron/reminders?secret=<CRON_SECRET>
 * (hoặc header `x-cron-secret: <CRON_SECRET>`). Thử trước bằng `&dryRun=true` (chỉ liệt kê Page sẽ được nhắc, không ghi thông báo).
 * Chạy cả T7/CN (không nằm trong `WEEKEND_SKIP_PATHS`) vì tuần đăng bài tính đủ 7 ngày.
 */
@ApiTags('Fanpages Reminders Cron (nội bộ - dùng cho Uptime)')
@Controller('fanpages-cron')
export class FanpagesCronController {
    private readonly logger = new Logger(FanpagesCronController.name);

    constructor(private readonly remindersService: FanpageRemindersService) { }

    private assertSecret(secretQuery?: string, secretHeader?: string, authorization?: string): void {
        const expected = process.env.CRON_SECRET;
        const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
        const provided = secretHeader || bearer || secretQuery;

        if (!expected) {
            throw new HttpException('CRON_SECRET chưa được cấu hình trên server - liên hệ admin để bật endpoint này.', HttpStatus.SERVICE_UNAVAILABLE);
        }
        if (!provided || provided !== expected) {
            throw new HttpException('Secret không hợp lệ.', HttpStatus.UNAUTHORIZED);
        }
    }

    @Get('reminders')
    @ApiOperation({
        summary:
            'CHỈ dùng cho dịch vụ Uptime bên ngoài gọi mỗi 30 phút - gửi nhắc việc Fanpage (im lặng theo mốc + nguy cơ trễ tuần) từ 17:00 giờ VN. Yêu cầu `secret`/`x-cron-secret` khớp CRON_SECRET.',
    })
    @ApiQuery({ name: 'secret', required: false, description: 'CRON_SECRET - có thể truyền qua query hoặc header x-cron-secret' })
    @ApiQuery({ name: 'dryRun', required: false, description: 'true = chỉ xem trước, không ghi thông báo' })
    async runReminders(
        @Query('secret') secretQuery?: string,
        @Query('dryRun') dryRun?: string,
        @Headers('x-cron-secret') secretHeader?: string,
        @Headers('authorization') authorization?: string,
    ) {
        this.assertSecret(secretQuery, secretHeader, authorization);
        try {
            const result = await this.remindersService.runDueReminders({ dryRun: dryRun === 'true' });
            this.logger.log(
                `[Cron] Nhắc Fanpage (${result.todayVn} ${result.nowVnHour}h${result.dryRun ? ', dryRun' : ''}): checked=${result.candidatesChecked}, silent=${result.silentPageIds.length}, atRisk=${result.atRiskPageIds.length}`,
            );
            return result;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`[Cron] Nhắc Fanpage thất bại: ${message}`);
            throw new HttpException(`Chạy nhắc Fanpage thất bại: ${message}`, HttpStatus.SERVICE_UNAVAILABLE);
        }
    }
}