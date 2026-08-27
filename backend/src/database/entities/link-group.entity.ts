import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
    ManyToOne,
    JoinColumn,
    OneToMany,
} from 'typeorm';
import { LinkCategory } from './link-category.entity';
import { CustomerGroupMembership } from './customer-group-membership.entity';

/**
 * 1 nhóm cụ thể được đặt tên (vd "Nhóm Zalo Sales HN"), thuộc 1 LinkCategory
 * (nền tảng), MỖI GROUP CÓ ĐÚNG 1 URL RIÊNG (đã xác nhận với người dùng -
 * các group khác nhau có URL khác nhau thật, không dùng chung).
 */
@Entity('link_groups')
@Index(['categoryId', 'name'], { unique: true })
export class LinkGroup {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'category_id' })
    categoryId: number;

    @ManyToOne(() => LinkCategory, (category) => category.groups, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'category_id' })
    category: LinkCategory;

    @Column({ length: 255 })
    name: string;

    @Column({ length: 500 })
    url: string;

    // Ẩn/hiện khỏi các danh sách chọn Group cho customer mới (không xoá dữ
    // liệu membership đã ghi nhận trước đó) - cùng tinh thần isLocked ở
    // LinkCategory/MediaSource.
    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @Column({ name: 'sort_order', default: 0 })
    sortOrder: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @OneToMany(() => CustomerGroupMembership, (m) => m.group)
    memberships: CustomerGroupMembership[];
}