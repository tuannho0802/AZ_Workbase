import { Column, Entity, PrimaryColumn } from 'typeorm';

/** IP -> quốc gia (P3.6). Ghi/đọc bằng SQL thô trong IpGeoService; entity chỉ để TypeORM biết bảng. */
@Entity('ip_geo_cache')
export class IpGeoCache {
    @PrimaryColumn({ type: 'varchar', length: 45 })
    ip: string;

    @Column({ name: 'country_code', type: 'varchar', length: 2, nullable: true })
    countryCode: string | null;

    @Column({ type: 'varchar', length: 10, default: 'unknown' })
    source: string;

    @Column({ name: 'resolved_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
    resolvedAt: Date;

    @Column({ name: 'updated_by', type: 'int', nullable: true })
    updatedBy: number | null;
}