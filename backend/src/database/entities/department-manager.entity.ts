import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Unique, Index } from 'typeorm';
import { Department } from './department.entity';
import { User } from './user.entity';

/**
 * Bảng nối NHIỀU-NHIỀU giữa `departments` và `users` - thay thế hoàn toàn
 * cách tính phạm vi scope='department' cũ (dựa vào cột đơn
 * `departments.manager_user_id`, 1 phòng ban chỉ gán được ĐÚNG 1 người).
 *
 * Lý do đổi (yêu cầu chủ dự án 2026-09-11): cần cho phép NHIỀU Manager cùng
 * quản lý 1 phòng ban, hoặc NHIỀU Assistant cùng được giới hạn hỗ trợ 1
 * phòng ban cụ thể - không còn giới hạn 1-1.
 *
 * ⚠️ Cột `departments.manager_user_id` (entity `Department.managerUserId`)
 * ĐƯỢC GIỮ NGUYÊN trong DB (không xoá cột theo đúng SKILL_FILE_MANAGEMENT.md
 * mục 3.1 - không tự ý drop cột khi chưa có lệnh tường minh) nhưng TỪ NAY
 * KHÔNG còn được bất kỳ logic phân quyền nào đọc/ghi nữa - coi như cột đã
 * deprecated, chỉ còn dữ liệu lịch sử (đã được migrate 1 lần sang bảng này
 * qua migration CreateDepartmentManagers).
 *
 * MỌI nơi trước đây check `department.managerUserId === userId` giờ phải
 * đổi sang kiểm tra tồn tại 1 dòng ở bảng này (department_id, user_id) -
 * xem `DepartmentManagerHelper` (departments/helpers) dùng chung cho
 * UsersAccessHelper/CustomerAccessHelper/LeaveRequestsService/ZkDeviceService.
 */
@Entity('department_managers')
@Unique('uk_department_manager', ['departmentId', 'userId'])
export class DepartmentManager {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'department_id' })
  @Index('idx_dept_managers_department')
  departmentId: number;

  @ManyToOne(() => Department, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'department_id' })
  department: Department;

  // ⚠️ CỐ Ý KHÔNG dùng ON DELETE CASCADE cho user_id (khác với department_id
  // ở trên): khi hard-delete 1 user, `UsersService.hardDeleteUser()` PHẢI tự
  // tay fallback gán dòng này sang callerId (đúng pattern "assign hiện hành
  // -> fallback cho người xoá" đã áp dụng cho customers.sales_user_id) -
  // nếu lỡ quên xử lý, FK RESTRICT mặc định sẽ ném lỗi rõ ràng thay vì âm
  // thầm xoá mất toàn bộ phân công quản lý phòng ban của user đó.
  @Column({ name: 'user_id' })
  @Index('idx_dept_managers_user')
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
