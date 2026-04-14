import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Customer } from './customer.entity';
import { User } from './user.entity';

export enum AssignmentStatus {
  ACTIVE = 'active',
  TRANSFERRED = 'transferred',
  RECLAIMED = 'reclaimed',
}

@Entity('customer_assignments')
@Index(['customerId'])
@Index(['assignedToId'])
@Index(['assignedById'])
@Index(['status'])
export class CustomerAssignment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'customer_id' })
  customerId: number;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  /** Người thực hiện việc gán (Admin/Manager) */
  @Column({ name: 'assigned_by_id' })
  assignedById: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'assigned_by_id' })
  assignedBy: User;

  /** Sales nhận data */
  @Column({ name: 'assigned_to_id' })
  assignedToId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'assigned_to_id' })
  assignedTo: User;

  /** Sales trước đó (nếu đây là chuyển giao) */
  @Column({ name: 'previous_assignee_id', nullable: true })
  previousAssigneeId: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'previous_assignee_id' })
  previousAssignee: User | null;

  @Column({
    type: 'enum',
    enum: AssignmentStatus,
    default: AssignmentStatus.ACTIVE,
  })
  status: AssignmentStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'assigned_at' })
  assignedAt: Date;

  @Column({ name: 'reclaimed_at', type: 'datetime', nullable: true })
  reclaimedAt: Date | null;

  @Column({ name: 'reclaimed_by_id', nullable: true })
  reclaimedById: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reclaimed_by_id' })
  reclaimedBy: User | null;
}
