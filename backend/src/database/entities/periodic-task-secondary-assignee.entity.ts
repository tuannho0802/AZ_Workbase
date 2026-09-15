import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { PeriodicTask } from './periodic-task.entity';
import { User } from './user.entity';

/**
 * PeriodicTaskSecondaryAssignee - "phụ trách phụ" của 1 Công việc định kỳ,
 * xem `PLAN_PERIODIC_TASKS_MODULE.md` mục 2.5 + 3 (Phase 4).
 *
 * Chọn mirror `link_group_secondary_managers` (bảng join THUẦN, add/remove,
 * KHÔNG giữ lịch sử) thay vì `customer_assignments` (có transfer/reclaim) -
 * lý do đã chốt ở PLAN mục 2.5: nghiệp vụ "phụ trách phụ 1 Task" không có
 * khái niệm chuyển nhượng/thu hồi như chia data khách hàng. Hard delete khi
 * gỡ (không soft-delete), đúng mẫu gốc. Muốn tra lịch sử ai từng được
 * thêm/gỡ khỏi Task nào - dùng `periodic_task_audit_logs` (Phase 7), không
 * cần trường riêng ở đây.
 *
 * "Chính" KHÔNG nằm trong bảng này - nó là 1 cột riêng trên chính Task
 * (`periodic_tasks.primary_assignee_id`, NOT NULL từ Phase 1), giống hệt
 * cách `customers.sales_user_id` (chính) tách biệt khỏi `customer_assignments`
 * (chia/phụ).
 *
 * CỐ TÌNH KHÔNG khai `@OneToMany` ngược lại ở `PeriodicTask` entity - đúng
 * quy ước đã áp dụng cho `PeriodicTaskLink`/`PeriodicTaskCustomer` (quan hệ
 * được truy vấn tường minh qua `PeriodicTaskSecondaryAssigneesService`, không
 * cần eager/lazy relation 2 chiều làm phức tạp thêm entity chính).
 */
@Entity('periodic_task_secondary_assignees')
@Index(['taskId', 'userId'], { unique: true })
export class PeriodicTaskSecondaryAssignee {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'task_id' })
  @Index()
  taskId: number;

  @ManyToOne(() => PeriodicTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: PeriodicTask;

  @Column({ name: 'user_id' })
  @Index()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Ai là người thêm phụ trách phụ này - phục vụ truy vết nhẹ, không phải
  // audit trail đầy đủ (audit thật nằm ở `periodic_task_audit_logs` Phase 7).
  @Column({ name: 'added_by_id', nullable: true })
  addedById: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'added_by_id' })
  addedBy: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
