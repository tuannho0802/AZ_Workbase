import { Controller, Get, Headers, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { RetentionService } from './retention.service';

/**
 * Endpoint cron cho Retention tự động — KHÔNG dùng JWT (Vercel Cron không có token người dùng).
 * Bảo vệ bằng `CRON_SECRET` qua header (`Authorization: Bearer ...` do Vercel tự gửi, hoặc `x-cron-secret`),
 * so sánh hằng thời gian. CỐ Ý KHÔNG nhận `?secret=` trên URL (tránh lộ secret trong log).
 *
 * Kích hoạt hằng ngày; `runIfDue()` tự thoát `NOT_DUE` nếu chưa đủ chu kỳ (14/30 ngày... cấu hình ở FE).
 */
export function assertCronSecret(authorization?: string, secretHeader?: string): void {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    throw new HttpException(
      'CRON_SECRET chưa được cấu hình trên server - liên hệ admin để bật endpoint này.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  const provided = secretHeader || bearer;
  const a = Buffer.from(provided ?? '');
  const b = Buffer.from(expected);
  if (!provided || a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HttpException('Secret không hợp lệ.', HttpStatus.UNAUTHORIZED);
  }
}

@ApiTags('System Cron (nội bộ)')
@Controller('system-cron')
export class RetentionCronController {
  private readonly logger = new Logger(RetentionCronController.name);

  constructor(private readonly retentionService: RetentionService) {}

  @Get('retention')
  @ApiOperation({
    summary:
      'Retention tự động: chạy dọn dẹp NẾU đến hạn theo chu kỳ đã cài (nếu chưa: trả skipped/NOT_DUE). Yêu cầu CRON_SECRET qua header.',
  })
  async runRetention(
    @Headers('authorization') authorization?: string,
    @Headers('x-cron-secret') secretHeader?: string,
  ) {
    assertCronSecret(authorization, secretHeader);
    try {
      return await this.retentionService.runIfDue();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Cron] Retention thất bại: ${message}`);
      throw new HttpException(`Chạy retention thất bại: ${message}`, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
