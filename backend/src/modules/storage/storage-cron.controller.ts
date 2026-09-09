import { Controller, Get, Headers, HttpException, HttpStatus, Logger, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { StorageService } from './storage.service';

/**
 * ⚠️ CONTROLLER RIÊNG - CỐ Ý KHÔNG dùng chung `StorageController` (có
 * `@UseGuards(JwtAuthGuard, PermissionGuard)` ở mức class).
 *
 * Lý do & cách bảo vệ bằng CRON_SECRET: giống HỆT
 * `zk-device-cron.controller.ts` - đọc kỹ comment ở file đó trước khi sửa
 * gì ở đây. Tái dùng ĐÚNG biến môi trường `CRON_SECRET` đã có sẵn (không
 * tạo secret riêng cho từng cron job - không cần thiết, cùng mức rủi ro).
 *
 * Cấu hình dịch vụ Uptime (cron-job.org / Vercel Cron) trỏ tới, gọi mỗi
 * 15-30 phút (KHÔNG cần dày hơn - đây chỉ là hạn mức MỀM để hiển thị, sai
 * lệch vài phút không ảnh hưởng gì):
 *   GET https://<domain>/api/storage-cron/refresh-usage?secret=<CRON_SECRET>
 */
@ApiTags('Storage Cron (nội bộ - dùng cho Uptime)')
@Controller('storage-cron')
export class StorageCronController {
  private readonly logger = new Logger(StorageCronController.name);

  constructor(private readonly storageService: StorageService) {}

  @Get('refresh-usage')
  @ApiOperation({
    summary:
      'CHỈ dùng cho dịch vụ Uptime bên ngoài gọi định kỳ - tính lại THẬT dung lượng B2 (liệt kê toàn bộ object, tốn Class C transaction) và ghi vào cache. Yêu cầu query param `secret` hoặc header `x-cron-secret` khớp biến môi trường CRON_SECRET.',
  })
  @ApiQuery({ name: 'secret', required: false, description: 'CRON_SECRET - có thể truyền qua query hoặc header x-cron-secret' })
  async refreshUsage(
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
      const result = await this.storageService.refreshUsageCache();
      this.logger.log(
        `[Cron] Refresh storage usage xong: total=${result.totalUsedBytes} bytes, buckets=${Object.keys(result.buckets).length}`,
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Cron] Refresh storage usage thất bại: ${message}`);
      throw new HttpException(`Refresh thất bại: ${message}`, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
