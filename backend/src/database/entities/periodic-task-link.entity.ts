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
 * PeriodicTaskLink - "cạnh" của đồ thị có hướng (DAG) liên kết phân cấp
 * Daily/Weekly/Monthly/Yearly, xem `PLAN_PERIODIC_TASKS_MODULE.md` mục 2.2 +
 * 3 (Phase 2).
 *
 * KHÔNG dùng cột `parent_id` đơn trên chính `periodic_tasks` vì nghiệp vụ đã
 * chốt cho phép **multi-parent** (1 Task con thuộc nhiều Task cha cùng lúc)
 * và **skip-level** (Daily link thẳng lên Monthly, bỏ qua Weekly) - đây là
 * quan hệ N-N thật sự, không phải cây đơn thuần, nên phải dùng bảng cạnh
 * riêng (mirror `link_group_secondary_managers` về độ đơn giản: bảng join
 * thuần, hard delete khi gỡ liên kết, KHÔNG giữ lịch sử - xem PLAN mục 2.5
 * áp dụng tương tự tinh thần "không cần audit trail riêng ở chính bảng này",
 * audit thật sự nằm ở `periodic_task_audit_logs` - Phase 7).
 *
 * Validate rank (`PERIOD_RANK[parent] > PERIOD_RANK[child]`) và chống chu
 * trình (cycle detection) được thực hiện ở `PeriodicTaskLinksService`, KHÔNG
 * phải ở tầng entity/DB (MySQL không có CHECK constraint linh hoạt đủ để
 * validate quan hệ đệ quy này).
 */
@Entity('periodic_task_links')
@Index(['childTaskId', 'parentTaskId'], { unique: true })
export class PeriodicTaskLink {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'child_task_id' })
  @Index()
  childTaskId: number;

  @ManyToOne(() => PeriodicTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'child_task_id' })
  childTask: PeriodicTask;

  @Column({ name: 'parent_task_id' })
  @Index()
  parentTaskId: number;

  @ManyToOne(() => PeriodicTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_task_id' })
  parentTask: PeriodicTask;

  @Column({ name: 'created_by_id', nullable: true })
  createdById: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
