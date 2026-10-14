import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * IP được miễn khoá đăng nhập theo IP (PLAN P3.5). Ghi/đọc bằng SQL thô trong LoginIpWhitelistService; entity này
 * chỉ để TypeORM biết bảng (autoLoadEntities) — không dùng `repository.save()` cho bảng này.
 */
@Entity('login_ip_whitelist')
@Unique('uk_login_ip_whitelist_ip', ['ip'])
export class LoginIpWhitelist {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 45 })
    ip: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    note: string | null;

    @Column({ name: 'created_by', type: 'int', nullable: true })
    createdBy: number | null;

    @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;
}