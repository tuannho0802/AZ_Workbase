import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { Fanpage } from './fanpage.entity';

/**
 * Số liệu định kỳ của Page do NHÂN VIÊN NHẬP TAY (không gọi API Meta/nền tảng - ràng buộc dự án).
 * 1 dòng / (Page, ngày CUỐI kỳ): UNIQUE (fanpage_id, snapshot_date) để lưới nhập và Drawer cùng upsert (PLAN X7).
 * `snapshot_date` là DATE thuần (YYYY-MM-DD, giờ VN) - mysql2 trả string, không dính múi giờ.
 */
@Entity('fanpage_metric_snapshots')
@Index('UQ_fanpage_snapshots_page_date', ['fanpageId', 'snapshotDate'], { unique: true })
@Index('IDX_fanpage_snapshots_date', ['snapshotDate'])
export class FanpageMetricSnapshot {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'fanpage_id', type: 'int' })
    fanpageId: number;

    @ManyToOne(() => Fanpage, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'fanpage_id' })
    fanpage: Fanpage;

    @Column({ name: 'snapshot_date', type: 'date' })
    snapshotDate: string;

    @Column({ type: 'int', unsigned: true, nullable: true, default: null })
    followers: number | null;

    // Lượt xem KÊNH trong cả kỳ [period_start, snapshot_date]. Cột `reach`/`engagement` cũ vẫn còn trong DB (nullable) nhưng
    // đã bỏ khỏi entity/API - sẽ DROP ở migration riêng sau khi backup (PLAN GĐ8).
    @Column({ type: 'int', unsigned: true, nullable: true, default: null })
    views: number | null;

    // Ngày đầu của kỳ `views`. NULL = kỳ 1 ngày (= snapshot_date). `followers` luôn là mốc tại `snapshot_date` (ngày cuối kỳ).
    @Column({ name: 'period_start', type: 'date', nullable: true, default: null })
    periodStart: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true, default: null })
    note: string | null;

    @Column({ name: 'created_by_id', type: 'int', nullable: true, default: null })
    createdById: number | null;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'created_by_id' })
    createdBy: User | null;

    @Column({ name: 'updated_by_id', type: 'int', nullable: true, default: null })
    updatedById: number | null;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'updated_by_id' })
    updatedBy: User | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}