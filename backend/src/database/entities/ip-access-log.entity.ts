import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Chi tiết lượt truy cập theo IP (P3.6): login/refresh từng dòng; request API gom theo thùng 1 phút (3.6.2). Ghi bằng SQL thô. */
@Entity('ip_access_logs')
export class IpAccessLog {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id: string;

    @Column({ type: 'varchar', length: 45 })
    ip: string;

    @Column({ name: 'country_code', type: 'varchar', length: 2, nullable: true })
    countryCode: string | null;

    /** login/refresh: `auth/login`...; request API: route MẪU `GET /customers/:id` (không bao giờ là URL thô). */
    @Column({ type: 'varchar', length: 80 })
    endpoint: string;

    /** Tên controller (vd `customers`) — chỉ có ở dòng request API. */
    @Column({ name: 'endpoint_group', type: 'varchar', length: 60, nullable: true })
    endpointGroup: string | null;

    /** Số request trong thùng 1 phút (XẤP XỈ, có thể thấp hơn thật). Login/refresh luôn 1. */
    @Column({ name: 'hit_count', type: 'int', default: 1 })
    hitCount: number;

    /** Đầu phút (đồng hồ DB) của thùng; NULL cho dòng login/refresh. */
    @Column({ name: 'bucket_minute', type: 'datetime', nullable: true })
    bucketMinute: Date | null;

    /** Mã HTTP của request gần nhất trong thùng. */
    @Column({ name: 'last_status', type: 'int', nullable: true })
    lastStatus: number | null;

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