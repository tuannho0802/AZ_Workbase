import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
    ManyToOne,
    OneToMany,
    JoinColumn,
} from 'typeorm';
import { BooleanTransformer } from '../transformers/boolean.transformer';
import { User } from './user.entity';
import { FanpagePlatform } from './fanpage-platform.entity';
import { FanpagePost } from './fanpage-post.entity';
import { FanpageNote } from './fanpage-note.entity';

/**
 * 1 Page/kênh của nhân viên (1 link = 1 Page). Mỗi nhân viên có nhiều Page, mỗi Page thuộc 1 nền tảng.
 * `ownerId` = người phụ trách (scope `own` của fanpages.* so với cột này). `url` UNIQUE (đã chuẩn hoá ở service).
 */
@Entity('fanpages')
@Index('UQ_fanpages_url', ['url'], { unique: true })
@Index('IDX_fanpages_owner', ['ownerId'])
@Index('IDX_fanpages_platform', ['platformId'])
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

    // false = ngừng theo dõi (vẫn giữ lịch sử bài đăng/ghi chú).
    @Column({ name: 'is_active', type: 'tinyint', default: 1, transformer: new BooleanTransformer() })
    isActive: boolean;

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