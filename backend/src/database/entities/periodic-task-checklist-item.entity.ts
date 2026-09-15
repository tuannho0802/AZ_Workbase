import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { PeriodicTask } from './periodic-task.entity';
import { User } from './user.entity';

/**
 * PeriodicTaskChecklistItem - checklist con kiểu Trello của 1 Công việc định
 * kỳ, xem `PLAN_PERIODIC_TASKS_MODULE.md` mục 3 + mục 6 (Phase 6).
 *
 * Item PHẲNG, KHÔNG có vòng đời/recurring riêng (khác chính `PeriodicTask`) -
 * chỉ là 1 dòng nội dung + trạng thái xong/chưa xong + vị trí sắp xếp trong
 * phạm vi 1 Task. Hard delete khi xoá item (không soft-delete), mirror
 * `PeriodicTaskSecondaryAssignee` (Phase 4) - đây là dữ liệu phụ trợ của
 * Task, không phải bản ghi nghiệp vụ chính cần giữ lịch sử.
 *
 * CỐ TÌNH KHÔNG khai `@OneToMany` ngược lại ở `PeriodicTask` entity - đúng
 * quy ước đã áp dụng cho `PeriodicTaskLink`/`PeriodicTaskCustomer`/
 * `PeriodicTaskSecondaryAssignee` (quan hệ được truy vấn tường minh qua
 * `PeriodicTaskChecklistItemsService`).
 */
@Entity('periodic_task_checklist_items')
@Index(['taskId', 'position'])
export class PeriodicTaskChecklistItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'task_id' })
  @Index()
  taskId: number;

  @ManyToOne(() => PeriodicTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: PeriodicTask;

  @Column({ type: 'varchar', length: 500 })
  content: string;

  @Column({ name: 'is_done', type: 'boolean', default: false })
  isDone: boolean;

  @Column({ type: 'int', default: 0 })
  position: number;

  @Column({ name: 'created_by_id', nullable: true })
  createdById: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
