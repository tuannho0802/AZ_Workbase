import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
    ManyToOne,
    OneToMany,
    ManyToMany,
    JoinTable,
    JoinColumn,
} from 'typeorm';
import { BooleanTransformer } from '../transformers/boolean.transformer';
import { User } from './user.entity';
import { FanpagePlatform } from './fanpage-platform.entity';
import { FanpagePost } from './fanpage-post.entity';
import { FanpageNote } from './fanpage-note.entity';
import { FanpageHealthStatus } from './fanpage-health-status.entity';

/**
 * 1 Page/kênh của nhân viên (1 link = 1 Page). Mỗi nhân viên có nhiều Page, mỗi Page thuộc 1 nền tảng.
 * `owners` (bảng nối `fanpage_owners`) = TẤT CẢ người phụ trách - nguồn sự thật cho scope `own`/`department` của fanpages.*.
 * `ownerId`/`owner` = người phụ trách CHÍNH (phần tử đầu của `owners`), giữ để tương thích ngược. `url` UNIQUE (đã chuẩn hoá ở service).
 */
@Entity('fanpages')
@Index('UQ_fanpages_url', ['url'], { unique: true })
@Index('IDX_fanpages_owner', ['ownerId'])
@Index('IDX_fanpages_platform', ['platformId'])
@Index('IDX_fanpages_health', ['healthStatusId'])
@Index('IDX_fanpages_archived', ['archivedAt'])
export class Fanpage {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'platform_id', type: 'int' })
    platformId: number;

    @ManyToOne(() => FanpagePlatform, (p) => p.fanpages, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'platform_id' })
    platform: FanpagePlatform;

    @Column({ type: 'varchar', length: 150 })
    name: string;

    @Column({ type: 'varchar', length: 500 })
    url: string;

    @Column({ name: 'owner_id', type: 'int', nullable: true, default: null })
    ownerId: number | null;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'owner_id' })
    owner: User | null;

    @ManyToMany(() => User)
    @JoinTable({
        name: 'fanpage_owners',
        joinColumn: { name: 'fanpage_id', referencedColumnName: 'id' },
        inverseJoinColumn: { name: 'user_id', referencedColumnName: 'id' },
    })
    owners: User[];

    // false = ngừng theo dõi (vẫn giữ lịch sử bài đăng/ghi chú).
    @Column({ name: 'is_active', type: 'tinyint', default: 1, transformer: new BooleanTransformer() })
    isActive: boolean;

    // Mục tiêu số bài/tuần (1-35); null = không đặt mục tiêu -> không có trạng thái `at_risk` (PLAN 3.2).
    @Column({ name: 'target_posts_per_week', type: 'tinyint', unsigned: true, nullable: true, default: null })
    targetPostsPerWeek: number | null;

    // Tình trạng thực của Page (danh mục động). null = chưa có (coi như không chặn).
    @Column({ name: 'health_status_id', type: 'int', nullable: true, default: null })
    healthStatusId: number | null;

    @ManyToOne(() => FanpageHealthStatus, (h) => h.fanpages, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'health_status_id', foreignKeyConstraintName: 'FK_fanpages_health_status' })
    healthStatus: FanpageHealthStatus | null;

    @Column({ name: 'health_note', type: 'varchar', length: 255, nullable: true, default: null })
    healthNote: string | null;

    @Column({ name: 'health_changed_at', type: 'timestamp', nullable: true, default: null })
    healthChangedAt: Date | null;

    // Đã lưu trữ (ẩn khỏi danh sách mặc định, ngầm is_active = false, giữ nguyên lịch sử). null = chưa lưu trữ.
    @Column({ name: 'archived_at', type: 'timestamp', nullable: true, default: null })
    archivedAt: Date | null;

    @Column({ name: 'created_by_id', type: 'int', nullable: true, default: null })
    createdById: number | null;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'created_by_id' })
    createdBy: User | null;

    @OneToMany(() => FanpagePost, (p) => p.fanpage)
    posts: FanpagePost[];

    @OneToMany(() => FanpageNote, (n) => n.fanpage)
    notes: FanpageNote[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}