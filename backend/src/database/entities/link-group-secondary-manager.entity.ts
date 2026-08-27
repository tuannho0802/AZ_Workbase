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
 * "Quản lý phụ" của 1 LinkGroup - bảng join đơn giản (1 group có thể có
 * NHIỀU quản lý phụ, 1 user có thể là quản lý phụ của NHIỀU group).
 *
 * Khác với `CustomerAssignment` (lịch sử đầy đủ transferred/reclaimed/lý
 * do) - ở đây CHỈ cần add/remove thuần tuý (giống `CustomerGroupMembership`
 * về độ đơn giản), vì yêu cầu nghiệp vụ không cần audit trail cho việc này.
 * Muốn biết ai từng là quản lý phụ trong quá khứ thì tra `deletedAt`... 
 * KHÔNG - bảng này xoá thẳng (hard delete) khi gỡ quản lý phụ, không soft
 * delete, vì không có yêu cầu giữ lịch sử.
 *
 * "Quản lý chính" KHÔNG nằm trong bảng này - nó là 1 cột riêng
 * (`link_groups.primary_manager_id`), giống hệt cách `customers.sales_user_id`
 * (chính) tách biệt khỏi `customer_assignments` (được chia/phụ).
 */
@Entity('link_group_secondary_managers')
@Index(['groupId', 'userId'], { unique: true })
export class LinkGroupSecondaryManager {
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

    // Ai là người thêm quản lý phụ này (admin hoặc chính quản lý chính của
    // group) - phục vụ truy vết nhẹ, không phải audit trail đầy đủ.
    @Column({ name: 'added_by_id', nullable: true })
    addedById: number | null;

    @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'added_by_id' })
    addedBy: User | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
