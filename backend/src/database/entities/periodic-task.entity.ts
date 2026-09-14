import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Department } from './department.entity';
import { PeriodicTaskStatus } from './periodic-task-status.entity';
import { PeriodType } from '../../common/enums/period-type.enum';

/**
 * PeriodicTask - "Công việc định kỳ" (Daily/Weekly/Monthly/Yearly), xem
 * `PLAN_PERIODIC_TASKS_MODULE.md` mục 1 + 3.
 *
 * ⚠️ KHÔNG có khái niệm Template/recurrence engine (đã chốt ở PLAN mục 1.1)
 * - mỗi dòng ở đây là 1 công việc CỤ THỂ do User tự tay tạo, độc lập hoàn
 * toàn, không tham chiếu ngược về bất kỳ "khuôn mẫu" nào.
 *
 * ⚠️ Phase 1 CHƯA có: cột lock (`is_locked`..., thêm ở Phase 5 qua migration
 * `AddPeriodicTaskLockColumns`), `periodic_task_customers` (Phase 3),
 * `periodic_task_secondary_assignees` (Phase 4) - KHÔNG khai `@OneToMany`
 * cho các bảng đó ở entity này cho tới khi đúng Phase tương ứng được code,
 * tránh TypeORM tham chiếu tới entity chưa tồn tại.
 *
 * `periodic_task_links` (Phase 2 - liên kết cha-con DAG) đã có (xem
 * `periodic-task-link.entity.ts`) nhưng CỐ TÌNH không khai `@OneToMany`
 * ngược lại ở đây - quan hệ cha-con được truy vấn qua
 * `PeriodicTaskLinksService` (join tường minh qua query builder), không cần
 * eager/lazy relation 2 chiều làm phức tạp thêm entity chính.
 */
@Entity('periodic_tasks')
@Index(['periodType'])
@Index(['statusId'])
@Index(['primaryAssigneeId'])
@Index(['departmentId'])
@Index(['periodStartDate'])
@Index(['deletedAt'])
export class PeriodicTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'period_type', type: 'enum', enum: PeriodType })
  periodType: PeriodType;

  // ⚠️ Cả periodStartDate/periodEndDate BẮT BUỘC truyền tường minh từ Client
  // (xem CreatePeriodicTaskDto) - CỐ Ý không tự suy ra biên tuần/tháng/năm
  // trong code (vd "tuần luôn bắt đầu Thứ 2") vì đây là quy ước có thể khác
  // nhau giữa các team, không được hardcode (đúng nguyên tắc chủ dự án yêu
  // cầu: "không được hardcode mà phải tuân thủ data được setup").
  @Column({ name: 'period_start_date', type: 'date' })
  periodStartDate: string;

  @Column({ name: 'period_end_date', type: 'date' })
  periodEndDate: string;

  @Column({ name: 'status_id' })
  statusId: number;

  // Màu Task (hex, ví dụ '#FF5733') - CHỈ dùng để hiển thị UI (Card, Kanban,
  // Calendar...) sau này, KHÔNG mang ý nghĩa nghiệp vụ/không ảnh hưởng RBAC.
  // Sửa tự do như mọi field khác, không bắt buộc lúc tạo.
  @Column({ type: 'varchar', length: 7, nullable: true })
  color: string | null;

  @ManyToOne(() => PeriodicTaskStatus, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'status_id' })
  status: PeriodicTaskStatus;

  // "Chính" - bắt buộc, mirror customers.salesUserId về Ý NGHĨA nhưng KHÔNG
  // nullable ở đây (1 Task luôn phải có đúng 1 người phụ trách chính ngay
  // từ lúc tạo, khác Customer có thể chưa gán sales lúc mới nhập).
  @Column({ name: 'primary_assignee_id' })
  primaryAssigneeId: number;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'primary_assignee_id' })
  primaryAssignee: User;

  // Auto-fill từ phòng ban của primaryAssignee lúc tạo, SỬA TỰ DO sau đó
  // (đã chốt PLAN mục 2.10 - không khoá cứng theo người phụ trách chính).
  @Column({ name: 'department_id', nullable: true })
  departmentId: number | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department: Department | null;

  @Column({ name: 'created_by_id' })
  createdById: number;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @Column({ name: 'updated_by_id', nullable: true })
  updatedById: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by_id' })
  updatedBy: User | null;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}