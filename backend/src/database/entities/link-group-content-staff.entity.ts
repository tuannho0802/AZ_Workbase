import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    Index,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { LinkGroup } from './link-group.entity';
import { User } from './user.entity';

/**
 * "Nhân viên Content" của 1 LinkGroup - bảng join ĐÚNG CÙNG CƠ CHẾ với
 * `LinkGroupSecondaryManager` (1 group có thể có NHIỀU nhân viên Content, 1
 * user có thể là Content của NHIỀU group) nhưng KHÁC vai trò nghiệp vụ: đây
 * là người phụ trách NỘI DUNG (viết bài/đăng bài) cho nhóm, không phải
 * "quản lý phụ" (thường thiên về quản trị nhóm/thành viên). Tách bảng riêng
 * (không gộp chung `link_group_secondary_managers` với thêm 1 cột `type`)
 * để không phải sửa lại toàn bộ code/permission hiện có của Quản lý phụ,
 * và để 1 user có thể VỪA là quản lý phụ VỪA là Content của cùng 1 group
 * (2 vai trò không loại trừ nhau) mà không đụng vào ràng buộc UNIQUE hiện
 * tại của bảng kia.
 *
 * Quyền thêm/xoá: CÙNG RULE với Quản lý phụ - chỉ Admin (hoặc role có
 * `link_groups.manage`) hoặc CHÍNH Quản lý chính của group đó - xem
 * `LinkGroupManagersService.addContentStaff/removeContentStaff` (tái dùng
 * `LinkGroupAccessHelper.canEditSecondaryManagers`, không tạo rule riêng).
 *
 * Không có audit trail transferred/reclaimed (giống Quản lý phụ) - chỉ cần
 * add/remove thuần tuý, hard delete khi gỡ.
 */
@Entity('link_group_content_staff')
@Index(['groupId', 'userId'], { unique: true })
export class LinkGroupContentStaff {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'group_id' })
    groupId: number;

    @ManyToOne(() => LinkGroup, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'group_id' })
    group: LinkGroup;

    @Column({ name: 'user_id' })
    @Index()
    userId: number;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    // Ai là người thêm nhân viên Content này (admin hoặc chính Quản lý
    // chính của group) - phục vụ truy vết nhẹ, giống hệt `addedById` ở
    // LinkGroupSecondaryManager.
    @Column({ name: 'added_by_id', nullable: true })
    addedById: number | null;

    @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'added_by_id' })
    addedBy: User | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
