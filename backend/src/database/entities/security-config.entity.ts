import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Cấu hình bảo mật đăng nhập — LUÔN 1 dòng (id = 1). Đọc qua SecurityConfigService (cache ~30s + kẹp giá trị
 * hợp lệ), KHÔNG đọc trực tiếp ở nơi khác. Xem PLAN_RETENTION_SECURITY_ROADMAP.md Phase 3.1.
 */
@Entity('security_config')
export class SecurityConfig {
    @PrimaryColumn({ type: 'int' })
    id: number;

    @Column({ name: 'account_max_failed_attempts', type: 'int', default: 5 })
    accountMaxFailedAttempts: number;

    @Column({ name: 'account_lock_minutes', type: 'int', default: 5 })
    accountLockMinutes: number;

    @Column({ name: 'ip_max_failed_attempts', type: 'int', default: 10 })
    ipMaxFailedAttempts: number;

    @Column({ name: 'ip_window_minutes', type: 'int', default: 10 })
    ipWindowMinutes: number;

    @Column({ name: 'ip_lock_minutes', type: 'int', default: 5 })
    ipLockMinutes: number;

    @Column({ name: 'security_event_retention_days', type: 'int', default: 180 })
    securityEventRetentionDays: number;

    @Column({ name: 'ip_access_log_retention_days', type: 'int', default: 90 })
    ipAccessLogRetentionDays: number;

    @Column({ name: 'ip_access_detail_cap_per_hour', type: 'int', default: 20 })
    ipAccessDetailCapPerHour: number;

    /** 1 = bật log request API đã đăng nhập (3.6.2), 0 = tắt khẩn cấp (không cần deploy). */
    @Column({ name: 'ip_access_log_api_enabled', type: 'int', default: 1 })
    ipAccessLogApiEnabled: number;

    @Column({ name: 'updated_by', type: 'int', nullable: true })
    updatedBy: number | null;

    @Column({ name: 'updated_at', type: 'datetime', nullable: true })
    updatedAt: Date | null;
}