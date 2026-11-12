import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { Fanpage } from './fanpage.entity';

/**
 * Mục tiêu THÁNG của Page: chỉ "follower tăng thêm" - để BÁO CÁO, KHÔNG kích hoạt nhắc việc và KHÔNG có mục tiêu số bài
 * (mục tiêu số bài/tuần nằm ở `fanpages.target_posts_per_week` - PLAN X8, tránh 2 nơi đặt mục tiêu mâu thuẫn).
 * `month` = 'YYYY-MM' (CHAR(7)).
 */
@Entity('fanpage_targets')
@Index('UQ_fanpage_targets_page_month', ['fanpageId', 'month'], { unique: true })
export class FanpageTarget {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'fanpage_id', type: 'int' })
    fanpageId: number;

    @ManyToOne(() => Fanpage, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'fanpage_id' })
    fanpage: Fanpage;

    @Column({ type: 'char', length: 7 })
    month: string;

    @Column({ name: 'target_follower_gain', type: 'int', unsigned: true, nullable: true, default: null })
    targetFollowerGain: number | null;

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