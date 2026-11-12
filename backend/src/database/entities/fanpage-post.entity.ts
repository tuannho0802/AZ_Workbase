import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Fanpage } from './fanpage.entity';

/** Bài đăng của 1 Page - nhân viên tự ghi tay (title tuỳ chọn, URL bài đăng bắt buộc, note tuỳ chọn). */
@Entity('fanpage_posts')
@Index('IDX_fanpage_posts_page_date', ['fanpageId', 'postedDate'])
export class FanpagePost {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'fanpage_id', type: 'int' })
    fanpageId: number;

    @ManyToOne(() => Fanpage, (f) => f.posts, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'fanpage_id' })
    fanpage: Fanpage;

    @Column({ type: 'varchar', length: 200, nullable: true, default: null })
    title: string | null;

    @Column({ type: 'varchar', length: 500 })
    url: string;

    // DATE thuần (YYYY-MM-DD) - không dính timezone; mysql2 trả string cho type 'date'.
    @Column({ name: 'posted_date', type: 'date', nullable: true, default: null })
    postedDate: string | null;

    @Column({ type: 'text', nullable: true })
    note: string | null;

    // Số liệu từng bài (C4) - nhập tay, NULL = chưa nhập (khác 0). `metricsUpdatedAt` = lần cuối sửa 1 trong 4 số này.
    @Column({ type: 'int', unsigned: true, nullable: true, default: null })
    views: number | null;

    @Column({ type: 'int', unsigned: true, nullable: true, default: null })
    likes: number | null;

    @Column({ type: 'int', unsigned: true, nullable: true, default: null })
    comments: number | null;

    @Column({ type: 'int', unsigned: true, nullable: true, default: null })
    shares: number | null;

    @Column({ name: 'metrics_updated_at', type: 'datetime', precision: 6, nullable: true, default: null })
    metricsUpdatedAt: Date | null;

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