import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Tổng hợp mỗi IP (P3.6) - danh sách "Theo dõi IP" đọc từ đây. Ghi bằng 1 câu upsert nguyên tử. */
@Entity('ip_access_stats')
export class IpAccessStats {
    @PrimaryColumn({ type: 'varchar', length: 45 })
    ip: string;

    @Column({ name: 'total_hits', type: 'int', default: 0 })
    totalHits: number;

    @Column({ name: 'success_hits', type: 'int', default: 0 })
    successHits: number;

    @Column({ name: 'failed_hits', type: 'int', default: 0 })
    failedHits: number;

    @Column({ name: 'blocked_hits', type: 'int', default: 0 })
    blockedHits: number;

    @Column({ name: 'suppressed_hits', type: 'int', default: 0 })
    suppressedHits: number;

    @Column({ name: 'first_seen_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
    firstSeenAt: Date;

    @Column({ name: 'last_seen_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
    lastSeenAt: Date;

    @Column({ name: 'last_outcome', type: 'varchar', length: 20, nullable: true })
    lastOutcome: string | null;

    @Column({ name: 'last_country_code', type: 'varchar', length: 2, nullable: true })
    lastCountryCode: string | null;

    @Column({ name: 'detail_window_started_at', type: 'datetime', nullable: true })
    detailWindowStartedAt: Date | null;

    @Column({ name: 'detail_window_count', type: 'int', default: 0 })
    detailWindowCount: number;

    /** Tổng request API đã đăng nhập (XẤP XỈ — đã gồm trong `total_hits`). */
    @Column({ name: 'api_hits', type: 'int', default: 0 })
    apiHits: number;

    /** Cửa sổ cap RIÊNG cho dòng chi tiết request API (không chiếm chỗ của dòng login/refresh). */
    @Column({ name: 'api_window_started_at', type: 'datetime', nullable: true })
    apiWindowStartedAt: Date | null;

    @Column({ name: 'api_window_count', type: 'int', default: 0 })
    apiWindowCount: number;
}