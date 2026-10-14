import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SecurityConfig } from '../../database/entities/security-config.entity';

export interface SecurityConfigValues {
    accountMaxFailedAttempts: number;
    accountLockMinutes: number;
    ipMaxFailedAttempts: number;
    ipWindowMinutes: number;
    ipLockMinutes: number;
    securityEventRetentionDays: number;
}

/** Mặc định (khớp seed migration CreateSecurityConfig). Dùng khi DB thiếu dòng/bảng hoặc giá trị ngoài khoảng. */
export const SECURITY_CONFIG_DEFAULTS: Readonly<SecurityConfigValues> = Object.freeze({
    accountMaxFailedAttempts: 5,
    accountLockMinutes: 5,
    ipMaxFailedAttempts: 10,
    ipWindowMinutes: 10,
    ipLockMinutes: 5,
    securityEventRetentionDays: 180,
});

/** Khoảng hợp lệ [min, max] — ngoài khoảng (vd ai đó đặt 0 trong DB) thì dùng mặc định, KHÔNG để tắt mất bảo vệ. */
export const SECURITY_CONFIG_LIMITS: Readonly<Record<keyof SecurityConfigValues, readonly [number, number]>> =
    Object.freeze({
        accountMaxFailedAttempts: [3, 100],
        accountLockMinutes: [1, 1440],
        ipMaxFailedAttempts: [3, 100],
        ipWindowMinutes: [1, 1440],
        ipLockMinutes: [1, 1440],
        securityEventRetentionDays: [30, 3650],
    });

/** Whitelist tên cột (KHÔNG ghép chuỗi từ input) khi UPDATE. */
const SECURITY_CONFIG_COLUMNS: Readonly<Record<keyof SecurityConfigValues, string>> = Object.freeze({
  accountMaxFailedAttempts: 'account_max_failed_attempts',
  accountLockMinutes: 'account_lock_minutes',
  ipMaxFailedAttempts: 'ip_max_failed_attempts',
  ipWindowMinutes: 'ip_window_minutes',
  ipLockMinutes: 'ip_lock_minutes',
  securityEventRetentionDays: 'security_event_retention_days',
});

export const SECURITY_CONFIG_CACHE_TTL_MS = 30_000;

/** Kẹp 1 giá trị: số nguyên trong [min, max], ngược lại trả mặc định. Hàm thuần để dễ test. */
export function clampSecurityValue(
    key: keyof SecurityConfigValues,
    raw: unknown,
): { value: number; clamped: boolean } {
    const [min, max] = SECURITY_CONFIG_LIMITS[key];
    const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
    if (typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max) {
        return { value: n, clamped: false };
    }
    return { value: SECURITY_CONFIG_DEFAULTS[key], clamped: true };
}

@Injectable()
export class SecurityConfigService {
    private readonly logger = new Logger(SecurityConfigService.name);
    private cache: { values: SecurityConfigValues; expiresAt: number } | null = null;
    private inflight: Promise<SecurityConfigValues> | null = null;

    constructor(@InjectRepository(SecurityConfig) private readonly repo: Repository<SecurityConfig>) { }

    /**
     * Cấu hình hiện hành (cache bộ nhớ ~30 giây/instance — đọc mỗi lần đăng nhập mà không thêm 1 query/lần).
     * Sửa trong DB có hiệu lực sau ≤ 30 giây. Lỗi DB (vd chưa chạy migration) -> dùng mặc định + `logger.error`,
     * KHÔNG ném lỗi: đăng nhập không được sập chỉ vì bảng cấu hình.
     */
    async get(): Promise<SecurityConfigValues> {
        const now = Date.now();
        if (this.cache && this.cache.expiresAt > now) return this.cache.values;
        if (this.inflight) return this.inflight;

        this.inflight = this.load()
            .then((values) => {
                this.cache = { values, expiresAt: Date.now() + SECURITY_CONFIG_CACHE_TTL_MS };
                return values;
            })
            .finally(() => {
                this.inflight = null;
            });
        return this.inflight;
    }

    /**
   * Sửa cấu hình (P4.3). Chỉ ghi các field có trong `patch` và nằm trong whitelist cột; đã kiểm khoảng ở DTO nhưng
   * vẫn kẹp lại ở đây (phòng gọi từ nơi khác). Trả `{ before, after }` để caller ghi audit. Xoá cache NGAY (instance này;
   * instance khác cập nhật sau ≤ 30 giây).
   */
  async update(
    patch: Partial<SecurityConfigValues>,
    actorId: number,
  ): Promise<{ before: SecurityConfigValues; after: SecurityConfigValues; changed: Array<keyof SecurityConfigValues> }> {
    this.invalidate();
    const before = await this.get();
    const sets: string[] = [];
    const params: number[] = [];
    const changed: Array<keyof SecurityConfigValues> = [];
    for (const key of Object.keys(SECURITY_CONFIG_DEFAULTS) as Array<keyof SecurityConfigValues>) {
      const raw = patch[key];
      if (raw === undefined || raw === null) continue;
      const { value, clamped } = clampSecurityValue(key, raw);
      if (clamped) continue; // ngoài khoảng: bỏ qua, KHÔNG ghi giá trị xấu
      if (value === before[key]) continue;
      sets.push(`\`${SECURITY_CONFIG_COLUMNS[key]}\` = ?`);
      params.push(value);
      changed.push(key);
    }
    if (sets.length > 0) {
      await this.repo.query(`INSERT IGNORE INTO security_config (id) VALUES (1)`);
      await this.repo.query(
        `UPDATE security_config SET ${sets.join(', ')}, updated_by = ?, updated_at = NOW() WHERE id = 1`,
        [...params, actorId],
      );
      this.invalidate();
    }
    const after = sets.length > 0 ? await this.get() : before;
    return { before, after, changed };
  }

  /** Xoá cache (dùng khi có API sửa cấu hình ở P4, hoặc trong test). */
    invalidate(): void {
        this.cache = null;
    }

    private async load(): Promise<SecurityConfigValues> {
        let row: SecurityConfig | null = null;
        try {
            row = await this.repo.findOne({ where: { id: 1 } });
        } catch (err) {
            this.logger.error(
                'Không đọc được security_config (đã chạy migration CreateSecurityConfig chưa?) - dùng giá trị mặc định',
                err instanceof Error ? err.stack : undefined,
            );
            return { ...SECURITY_CONFIG_DEFAULTS };
        }
        if (!row) {
            this.logger.warn('security_config chưa có dòng id=1 - dùng giá trị mặc định');
            return { ...SECURITY_CONFIG_DEFAULTS };
        }

        const out = { ...SECURITY_CONFIG_DEFAULTS } as SecurityConfigValues;
        for (const key of Object.keys(SECURITY_CONFIG_DEFAULTS) as Array<keyof SecurityConfigValues>) {
            const { value, clamped } = clampSecurityValue(key, row[key]);
            if (clamped) {
                this.logger.warn(
                    `[SECURITY] security_config.${key}=${String(row[key])} ngoài khoảng hợp lệ ${SECURITY_CONFIG_LIMITS[key][0]}–${SECURITY_CONFIG_LIMITS[key][1]} - dùng mặc định ${value}`,
                );
            }
            out[key] = value;
        }
        return out;
    }
}