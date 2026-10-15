import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * IP bị Admin chặn đăng nhập CHỦ ĐỘNG (PLAN P3.7). Ghi/đọc bằng SQL thô trong LoginIpBlacklistService; entity này
 * chỉ để TypeORM biết bảng (autoLoadEntities) — không dùng `repository.save()` cho bảng này.
 */
@Entity('login_ip_blacklist')
@Unique('uk_login_ip_blacklist_ip', ['ip'])
export class LoginIpBlacklist {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 45 })
    ip: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    reason: string | null;

    /** NULL = vĩnh viễn. */
    @Column({ name: 'expires_at', type: 'datetime', nullable: true })
    expiresAt: Date | null;

    @Column({ name: 'created_by', type: 'int', nullable: true })
    createdBy: number | null;

    @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;
}
