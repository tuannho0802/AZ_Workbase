import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { Fanpage } from './fanpage.entity';
import { Utm } from './utm.entity';

/**
 * Liên kết Page ↔ UTM (nhiều-nhiều, PLAN 3.7). `primaryUtmId === utmId` => Page CHÍNH (ghi công) của UTM đó;
 * `null` => Page "tham gia". UNIQUE(primary_utm_id) trong DB đảm bảo mỗi UTM tối đa 1 Page chính.
 * Dùng helper `isPrimaryLink()` thay vì tự so sánh.
 */
@Entity('fanpage_utms')
@Index('UQ_fanpage_utms_page_utm', ['fanpageId', 'utmId'], { unique: true })
@Index('UQ_fanpage_utms_primary', ['primaryUtmId'], { unique: true })
@Index('IDX_fanpage_utms_utm', ['utmId'])
export class FanpageUtm {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'fanpage_id', type: 'int' })
    fanpageId: number;

    @ManyToOne(() => Fanpage, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'fanpage_id' })
    fanpage: Fanpage;

    @Column({ name: 'utm_id', type: 'int' })
    utmId: number;

    @ManyToOne(() => Utm, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'utm_id' })
    utm: Utm;

    @Column({ name: 'primary_utm_id', type: 'int', nullable: true, default: null })
    primaryUtmId: number | null;

    @Column({ name: 'created_by_id', type: 'int', nullable: true, default: null })
    createdById: number | null;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'created_by_id' })
    createdBy: User | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}