import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Chi tiết từng lượt login/refresh theo IP (P3.6). Ghi bằng SQL thô trong IpAccessLogService. */
@Entity('ip_access_logs')
export class IpAccessLog {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id: string;

    @Column({ type: 'varchar', length: 45 })
    ip: string;

    @Column({ name: 'country_code', type: 'varchar', length: 2, nullable: true })
    countryCode: string | null;

    @Column({ type: 'varchar', length: 40 })
    endpoint: string;

    @Column({ type: 'varchar', length: 20 })
    outcome: string;

    @Column({ name: 'ip_status', type: 'varchar', length: 12, default: 'normal' })
    ipStatus: string;

    @Column({ name: 'user_id', type: 'int', nullable: true })
    userId: number | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    email: string | null;

    @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
    userAgent: string | null;

    @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;
}