import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { PeriodicTask } from './periodic-task.entity';
import { Customer } from './customer.entity';
import { User } from './user.entity';

/**
 * PeriodicTaskCustomer - Phase 3 (PLAN mục 6): liên kết N-N giữa
 * `periodic_tasks` và `customers` ("Khách hôm nay: 1, 2, 3" - PLAN mục 3).
 *
 * ⚠️ CỐ TÌNH không khai `@OneToMany` ngược lại ở `PeriodicTask`/`Customer` -
 * mirror đúng cách `periodic_task_links` (Phase 2) đã làm: truy vấn qua
 * `PeriodicTaskCustomersService` (join tường minh qua query builder), không
 * cần eager/lazy relation 2 chiều làm phức tạp thêm 2 entity chính vốn đã
 * được nhiều module khác tham chiếu.
 */
@Entity('periodic_task_customers')
@Index(['taskId'])
@Index(['customerId'])
export class PeriodicTaskCustomer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'task_id' })
  taskId: number;

  @ManyToOne(() => PeriodicTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: PeriodicTask;

  @Column({ name: 'customer_id' })
  customerId: number;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ name: 'linked_by_id', nullable: true })
  linkedById: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'linked_by_id' })
  linkedBy: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
