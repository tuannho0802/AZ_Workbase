import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { waitUntil } from '@vercel/functions';
import { Setting } from '../../database/entities/setting.entity';

export const PERMISSIONS_VERSION_KEY = 'permissions_version';
// Cache đọc ngắn/instance: nhiều user cùng instance chỉ tốn 1 query/10s. Bump xoá cache ngay trên instance xử lý.
export const PERMISSIONS_VERSION_CACHE_TTL_MS = 10_000;

export interface PermissionSigUser {
  role: string;
  departmentId?: number | null;
  positionId?: number | null;
  isRootAdmin?: boolean;
}

/**
 * "Phiên bản quyền" toàn cục, lưu ở bảng `settings` có sẵn (key `permissions_version`) - KHÔNG cần
 * bảng/migration mới và dùng chung được giữa nhiều instance Vercel (khác biến trong RAM).
 *
 * `bump()` được gọi từ `PermissionsService.invalidate()` và `UiVisibilityService.invalidate()` -
 * đúng các chỗ mọi thao tác sửa ma trận quyền/override/ẩn-hiện UI/role đã gọi sẵn, nên không thể sót.
 * `/notifications/poll` trả kèm `permSig` = phiên bản + role/phòng ban/vị trí HIỆN TẠI của user
 * (lấy từ JwtStrategy), nên đổi role/phòng ban/vị trí của chính user cũng đổi chữ ký mà không cần bump.
 * FE thấy `permSig` đổi thì refetch quyền ngay (xem usePermissionChangeSignal).
 */
@Injectable()
export class PermissionsVersionService {
  private readonly logger = new Logger(PermissionsVersionService.name);
  private cached: { value: number; expiresAt: number } | null = null;

  constructor(@InjectRepository(Setting) private readonly settingRepo: Repository<Setting>) {}

  /** Đọc phiên bản hiện tại. KHÔNG BAO GIỜ throw - lỗi trả `undefined` (poll vẫn chạy, FE bỏ qua tín hiệu). */
  async get(): Promise<number | undefined> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) return this.cached.value;
    try {
      const row = await this.settingRepo.findOne({ where: { key: PERMISSIONS_VERSION_KEY } });
      const value = row ? Number(row.value) || 0 : 0; // chưa có dòng = 0 (chưa ai đổi quyền)
      this.cached = { value, expiresAt: now + PERMISSIONS_VERSION_CACHE_TTL_MS };
      return value;
    } catch (err) {
      this.logger.warn(`Không đọc được permissions_version: ${err instanceof Error ? err.message : String(err)}`);
      return undefined; // không cache lỗi
    }
  }

  /** Tăng phiên bản (fire-and-forget qua waitUntil, không chặn request, không throw). */
  bump(): void {
    this.cached = null;
    const task = this.bumpNow();
    try {
      waitUntil(task);
    } catch {
      // Ngoài Vercel: promise vẫn chạy.
    }
  }

  async bumpNow(): Promise<void> {
    try {
      await this.settingRepo.query(
        'INSERT INTO settings (`key`, `value`, `description`) VALUES (?, ?, ?) ' +
          'ON DUPLICATE KEY UPDATE `value` = CAST(`value` AS UNSIGNED) + 1',
        [PERMISSIONS_VERSION_KEY, '1', 'Tăng mỗi khi quyền/ẩn-hiện UI thay đổi - FE dùng để làm mới quyền ngay'],
      );
    } catch (err) {
      this.logger.error(`Không bump được permissions_version: ${err instanceof Error ? err.stack : String(err)}`);
    } finally {
      this.cached = null; // lần đọc kế tiếp lấy giá trị mới từ DB
    }
  }

  /** Chữ ký quyền của 1 user: đổi khi phiên bản toàn cục đổi HOẶC role/phòng ban/vị trí/root-admin của user đổi. */
  async buildSig(user: PermissionSigUser): Promise<string | undefined> {
    const version = await this.get();
    if (version === undefined) return undefined;
    return [version, user.role, user.departmentId ?? 0, user.positionId ?? 0, user.isRootAdmin ? 1 : 0].join(':');
  }
}
