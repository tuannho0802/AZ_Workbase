import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * Bộ đếm đăng nhập sai theo IP. Ghi/đọc bằng SQL thô nguyên tử trong LoginIpBlockService (đồng hồ DB `NOW()`),
 * entity này chỉ để TypeORM biết bảng (autoLoadEntities) — không dùng `repository.save()` cho bảng này.
 */
@Entity('login_ip_blocks')
@Unique('uk_login_ip_blocks_ip', ['ip'])
export class LoginIpBlock {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 45 })
    ip: string;

    @Column({ name: 'failed_count', type: 'int', default: 0 })
    failedCount: number;

    @Column({ name: 'window_started_at', type: 'datetime' })
    windowStartedAt: Date;

    @Column({ name: 'blocked_until', type: 'datetime', nullable: true })
    blockedUntil: Date | null;

    @Column({ name: 'last_email', type: 'varchar', length: 255, nullable: true })
    lastEmail: string | null;

    @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;

    @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updatedAt: Date;
}