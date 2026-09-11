import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * LeaveType (Loại đơn nghỉ phép) - thay thế ENUM cứng `leave_requests.leave_type`
 * cũ (`LeaveType` enum ở `leave-request.entity.ts`), cho phép Admin/Assistant tự
 * CRUD loại phép qua UI "Quản lý loại phép" thay vì phải sửa code - mirror
 * CHÍNH XÁC pattern `CustomerStatus` (xem `customer-status.entity.ts` +
 * `CreateCustomerStatuses1781400000000`).
 *
 * `code` bất biến sau khi tạo (giống `CustomerStatus.code`) vì đây là giá trị
 * THẬT SỰ được lưu vào cột `leave_requests.leave_type` - đổi `code` sau khi đã
 * có đơn dùng sẽ làm "mồ côi" dữ liệu cũ, nên khoá cứng ở DTO update, không
 * chặn thêm ở entity.
 */
@Entity('leave_types')
export class LeaveType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  // TRUE cho 7 loại phép seed sẵn (annual/sick/maternity/unpaid/compensatory/
  // meet_client/late_arrival) - bảo vệ khỏi bị xoá nhầm ở
  // `LeaveTypesService.remove()`, đúng pattern `CustomerStatus.isSystem`.
  // Admin/Assistant vẫn ĐƯỢC sửa tên/màu/mô tả/is_paid của loại phép hệ
  // thống, chỉ không xoá được.
  @Column({ name: 'is_system', default: false })
  isSystem: boolean;

  // Mã màu hex (vd '#1890ff') - UI dùng để tô màu Tag hiển thị loại phép này
  // ở mọi nơi (dropdown "Loại phép", bảng đơn nghỉ, bảng tổng hợp chấm công).
  @Column({ type: 'varchar', length: 20, default: '#1890ff' })
  color: string;

  // Hưởng lương hay không - QUYẾT ĐỊNH ký hiệu chấm công tương ứng ở bảng
  // "Tổng hợp chấm công" (AttendanceMonthlyTab.tsx):
  //   isPaid=true  + duration=full_day  -> 'P'    (Nghỉ phép, hưởng lương)
  //   isPaid=true  + duration=half_day  -> 'X/2'  (Nghỉ nửa ngày, hưởng lương)
  //   isPaid=false + duration=full_day  -> 'KL'   (Nghỉ không lương, cả ngày)
  //   isPaid=false + duration=half_day  -> '1/2K' (Nghỉ nửa ngày, không lương)
  @Column({ name: 'is_paid', default: true })
  isPaid: boolean;

  // Có trừ vào `users.annual_leave_balance` khi đơn được duyệt hay không -
  // giữ đúng hành vi cũ (trước đây hardcode chỉ ANNUAL/SICK mới trừ, xem
  // `LeaveRequestsService.approve()`), giờ chuyển thành cấu hình theo từng
  // loại phép thay vì so sánh cứng theo enum.
  @Column({ name: 'deducts_annual_balance', default: false })
  deductsAnnualBalance: boolean;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
