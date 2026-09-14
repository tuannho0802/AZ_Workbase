import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * PeriodicTaskStatus - "Trạng thái Công việc định kỳ", Admin tự CRUD qua UI,
 * mirror ĐÚNG pattern `CustomerStatus`/`LeaveType` (đã có sẵn trong repo,
 * xem `customer-status.entity.ts`) - KHÔNG dùng ENUM cứng như `PeriodType`
 * (khác nhau: PeriodType là cấu trúc phân cấp cố định, Status là danh mục
 * nghiệp vụ Admin cần tự thêm/bớt tuỳ theo quy trình từng team).
 *
 * `code` bất biến sau khi tạo (giá trị THẬT được `periodic_tasks.status_id`
 * tham chiếu qua FK thật - khác `customer_statuses.code` là tham chiếu rời
 * rạc do lịch sử migrate từ ENUM cũ, ở đây bảng mới hoàn toàn nên dùng FK
 * chuẩn ngay từ đầu).
 *
 * 2 cột `isDoneState`/`isExcludedFromRollup` PHỤC VỤ tính % rollup ở Phase 2
 * (`PLAN_PERIODIC_TASKS_MODULE.md` mục 2.3) - khai sẵn từ Phase 1 vì đây là
 * thuộc tính của chính status, không phụ thuộc bảng `periodic_task_links`
 * (chưa tồn tại ở Phase 1) mới dùng tới.
 */
@Entity('periodic_task_statuses')
export class PeriodicTaskStatus {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  // TRUE cho 3 trạng thái seed sẵn (pending/completed/not_completed) - bảo
  // vệ khỏi bị xoá nhầm, đúng pattern `CustomerStatus.isSystem`.
  @Column({ name: 'is_system', default: false })
  isSystem: boolean;

  @Column({ type: 'varchar', length: 20, default: '#1890ff' })
  color: string;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  // Status này có tính vào TỬ SỐ của % rollup không (xem PLAN mục 2.3) -
  // Admin có thể đánh dấu nhiều status cùng là "hoàn thành" (vd "Hoàn thành"
  // và "Hoàn thành sớm" đều is_done_state=true).
  @Column({ name: 'is_done_state', default: false })
  isDoneState: boolean;

  // Status này có bị loại khỏi CẢ tử số lẫn mẫu số của % rollup không (vd
  // "Đã huỷ" - không tính là xong, cũng không tính là "còn treo").
  @Column({ name: 'is_excluded_from_rollup', default: false })
  isExcludedFromRollup: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
