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
 * PeriodicTaskAuditLog - Phase 7 (CUỐI) của module "Công việc định kỳ", xem
 * `PLAN_PERIODIC_TASKS_MODULE.md` mục 2.6 + mục 6 (Phase 7).
 *
 * Mirror schema của `AuditLog` (`audit_logs` chung) nhưng TÁCH bảng riêng,
 * có FK thật `task_id` -> `periodic_tasks(id)` (khác `audit_logs` dùng
 * `entity_type`/`entity_id` rời rạc phải JOIN thủ công) - cho phép
 * `GET /periodic-tasks/:id/audit-logs` join thẳng, nhanh và rõ ràng hơn khi
 * debug lịch sử của 1 Task cụ thể (PLAN mục 2.6).
 *
 * `ON DELETE CASCADE` theo `task_id` - Task xoá mềm (`deleted_at`) vẫn giữ
 * nguyên log (không đụng tới), nhưng nếu 1 ngày nào đó Task bị xoá cứng thật
 * sự (ngoài quy ước hiện tại) thì log con cũng dọn theo, tránh rác mồ côi.
 *
 * CỐ TÌNH KHÔNG khai `@OneToMany` ngược lại ở `PeriodicTask` entity - đúng
 * quy ước đã áp dụng cho `PeriodicTaskLink`/`PeriodicTaskCustomer`/
 * `PeriodicTaskSecondaryAssignee`/`PeriodicTaskChecklistItem` (quan hệ được
 * truy vấn tường minh qua Service, không cần relation 2 chiều).
 */
@Entity('periodic_task_audit_logs')
@Index(['taskId'])
@Index(['createdAt'])
export class PeriodicTaskAuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'task_id' })
  taskId: number;

  @ManyToOne(() => PeriodicTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: PeriodicTask;

  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 50 })
  action: string;

  @Column({ type: 'json', name: 'old_data', nullable: true })
  oldData: any;

  @Column({ type: 'json', name: 'new_data', nullable: true })
  newData: any;

  @Column({ name: 'ip_address', length: 45, nullable: true })
  ipAddress: string;

  @Column({ type: 'text', name: 'user_agent', nullable: true })
  userAgent: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
