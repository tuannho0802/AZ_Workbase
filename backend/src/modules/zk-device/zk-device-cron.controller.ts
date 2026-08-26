import { Controller, Get, Headers, Query, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ZkDeviceService } from './zk-device.service';
import {
  parseLocalDateStart,
  parseLocalDateEnd,
  getVnTodayIsoDate,
} from '../../integrations/zk-device/decode-device-time.util';

/**
 * ⚠️ CONTROLLER RIÊNG - CỐ Ý KHÔNG dùng chung `ZkDeviceController` (nơi có
 * `@UseGuards(JwtAuthGuard, RolesGuard)` ở mức class).
 *
 * Lý do: endpoint này dành cho 1 dịch vụ Uptime BÊN NGOÀI (UptimeRobot,
 * cron-job.org, hoặc Vercel Cron...) gọi tự động MỖI NGÀY để đồng bộ log
 * "hôm nay" - không cần bấm tay. Các dịch vụ này không đăng nhập được vào hệ
 * thống nên không thể mang theo JWT (mà JWT lại hết hạn sau 1h, không dịch vụ
 * ngoài nào tự làm mới được). Thay vào đó, bảo vệ bằng 1 secret TĨNH
 * (`CRON_SECRET` trong biến môi trường) - đủ dùng vì endpoint này chỉ làm
 * đúng 1 việc cố định (sync log hôm nay), không đọc/ghi gì khác, không nhận
 * tham số nào từ bên ngoài ngoài secret.
 *
 * Cấu hình dịch vụ Uptime trỏ tới:
 *   GET https://<domain>/api/zk-device-cron/sync-today?secret=<CRON_SECRET>
 * (hoặc header `x-cron-secret: <CRON_SECRET>` nếu dịch vụ hỗ trợ header tuỳ chỉnh)
 */
@ApiTags('ZK Device Cron (nội bộ - dùng cho Uptime)')
@Controller('zk-device-cron')
export class ZkDeviceCronController {
  private readonly logger = new Logger(ZkDeviceCronController.name);

  constructor(private readonly zkDeviceService: ZkDeviceService) {}

  @Get('sync-today')
  @ApiOperation({
    summary:
      'CHỈ dùng cho dịch vụ Uptime bên ngoài gọi tự động mỗi ngày - đồng bộ log chấm công của riêng HÔM NAY (theo giờ VN). Yêu cầu query param `secret` hoặc header `x-cron-secret` khớp biến môi trường CRON_SECRET.',
  })
  @ApiQuery({ name: 'secret', required: false, description: 'CRON_SECRET - có thể truyền qua query hoặc header x-cron-secret' })
  async syncToday(
    @Query('secret') secretQuery?: string,
    @Headers('x-cron-secret') secretHeader?: string,
  ) {
    const expected = process.env.CRON_SECRET;
    const provided = secretHeader || secretQuery;

    if (!expected) {
      // Chưa cấu hình CRON_SECRET -> CHẶN HẲN thay vì mở public không giới
      // hạn. An toàn hơn nhiều so với "quên cấu hình mà vô tình public hoá".
      throw new HttpException(
        'CRON_SECRET chưa được cấu hình trên server - liên hệ admin để bật endpoint này.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!provided || provided !== expected) {
      throw new HttpException('Secret không hợp lệ.', HttpStatus.UNAUTHORIZED);
    }

    const todayIso = getVnTodayIsoDate();

    try {
      const result = await this.zkDeviceService.syncNow({
        from: parseLocalDateStart(todayIso),
        to: parseLocalDateEnd(todayIso),
      });
      this.logger.log(
        `[Cron] Sync hôm nay (${todayIso}) xong: fetched=${result.totalFetchedFromDevice}, inRange=${result.recordsInRange}, insertedNew=${result.insertedNew}, matched=${result.matchedToUser}`,
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Cron] Sync hôm nay (${todayIso}) thất bại: ${message}`);
      throw new HttpException(`Đồng bộ thất bại: ${message}`, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
