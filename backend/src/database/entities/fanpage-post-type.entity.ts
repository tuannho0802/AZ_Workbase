import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, OneToMany } from 'typeorm';
import { BooleanTransformer } from '../transformers/boolean.transformer';
import { FanpagePost } from './fanpage-post.entity';

/**
 * Danh mục \"Loại bài\" (E5a: Ảnh / Video / Reels / Bài viết / Livestream...). Admin/Assistant thêm/sửa/KHOÁ, KHÔNG xoá
 * (bài cũ vẫn tham chiếu) - khoá = không chọn được cho bài mới, bài đang dùng vẫn hiện đúng tên.
 * Bảng + cột `fanpage_posts.post_type_id` đã có từ migration M2 `1786392000000-CreateFanpageMetrics`.
 */
@Entity('fanpage_post_types')
@Index('UQ_fanpage_post_types_name', ['name'], { unique: true })
export class FanpagePostType {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 50 })
    name: string;

    @Column({ type: 'varchar', length: 20, default: '#1677ff' })
    color: string;

    @Column({ name: 'is_locked', type: 'tinyint', default: 0, transformer: new BooleanTransformer() })
    isLocked: boolean;

    @Column({ name: 'sort_order', type: 'int', default: 0 })
    sortOrder: number;

    @OneToMany(() => FanpagePost, (p) => p.postType)
    posts: FanpagePost[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}