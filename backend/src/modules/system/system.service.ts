import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PermissionsVersionService } from '../permissions/permissions-version.service';

/** Khoảng tối thiểu giữa 2 lần Reset (đọc từ `settings.updated_at` nên đúng trên mọi instance serverless). */
export const SYSTEM_RESET_COOLDOWN_MS = 30_000;

export interface SystemResetActor {
  id: number;
}

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);

  constructor(
    private readonly versionService: PermissionsVersionService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * "Reset hệ thống" = tăng `system_epoch`. Không xoá/đổi dữ liệu nào.
   *  - FE: mọi tab đang mở thấy `epoch` mới trong lần poll kế tiếp (<= 2 phút) -> làm mới toàn bộ cache React Query.
   *  - BE: cache quyền / ẩn-hiện UI / số đếm badge (theo từng instance) mang epoch cũ bị coi là hết hạn.
   * Cooldown 30 s chống bấm dồn (mỗi lần Reset khiến MỌI user tải lại dữ liệu).
   */
  async reset(actor: SystemResetActor, ipAddress?: string, userAgent?: string): Promise<{ epoch: number; resetAt: string }> {
    const before = await this.versionService.getEpochState();
    if (before.updatedAt) {
      const waitMs = SYSTEM_RESET_COOLDOWN_MS - (Date.now() - before.updatedAt.getTime());
      if (waitMs > 0) {
        throw new HttpException(
          `Vừa Reset hệ thống xong, vui lòng đợi ${Math.ceil(waitMs / 1000)} giây rồi thử lại.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const epoch = await this.versionService.bumpEpoch(); // throw nếu ghi lỗi -> người bấm biết Reset KHÔNG thành công
    const resetAt = new Date().toISOString();
    this.logger.log(`System reset by user #${actor.id}: epoch ${before.value} -> ${epoch}`);

    // Audit không được làm hỏng Reset đã thành công.
    this.auditService.logActionAsync(actor.id, 'SYSTEM_RESET', 'system', epoch, { epoch: before.value }, { epoch }, ipAddress, userAgent);
    return { epoch, resetAt };
  }
}
