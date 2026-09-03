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
import { LinkGroup } from './link-group.entity';
import { Customer } from './customer.entity';
import { User } from './user.entity';

/**
 * Trạng thái "đã join nhóm" của 1 CUSTOMER với 1 LinkGroup cụ thể - đã xác
 * nhận với người dùng: tính theo KHÁCH HÀNG (không phải nhân viên). Khác
 * hẳn `users.profile` (JSON link nhân viên tự quản lý) - 2 tính năng độc
 * lập, không liên quan.
 */
@Entity('customer_group_memberships')
@Index(['groupId', 'customerId'], { unique: true })
export class CustomerGroupMembership {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'group_id' })
    groupId: number;

    @ManyToOne(() => LinkGroup, (group) => group.memberships, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'group_id' })
    group: LinkGroup;

    @Column({ name: 'customer_id' })
    @Index()
    customerId: number;

    @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'customer_id' })
    customer: Customer;

    @Column({ default: false })
    joined: boolean;

    @Column({ name: 'joined_at', type: 'timestamp', nullable: true })
    @Index()
    joinedAt: Date | null;

    // Nhân viên nào là người TOGGLE trạng thái này gần nhất - phục vụ truy vết
    // sau này nếu cần (vd đối chiếu khi có tranh chấp "ai xác nhận khách đã join").
    @Column({ name: 'updated_by', nullable: true })
    updatedBy: number | null;

    @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'updated_by' })
    updatedByUser: User | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}