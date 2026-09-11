import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ⚠️ BỐI CẢNH (yêu cầu chủ dự án, 2026-09-11): `isEligibleApprover()` trong
 * `leave-requests.service.ts` trước migration này CHỈ xét 1 tiêu chí duy
 * nhất cho scope='department': `department.manager_user_id = approverId`
 * VÀ `requester.department_id = department.id` - tức Manager chỉ duyệt được
 * đơn của người CÙNG phòng ban mà Manager đó là quản lý. Điều này ĐÚNG cho
 * đa số trường hợp (kể cả Assistant nằm chung phòng ban với Manager cũng
 * duyệt được, không cần đổi gì - do code không hề phân biệt role của người
 * xin nghỉ, chỉ xét department).
 *
 * NHƯNG có 1 số Assistant là NGOẠI LỆ: về mặt tổ chức, họ phải được duyệt
 * bởi 1 Manager cụ thể dù `department_id` của họ KHÔNG khớp (hoặc null,
 * hoặc thuộc phòng ban khác không do Manager đó quản lý). Phương án "đổi
 * department_id của Assistant đó sang đúng phòng ban Manager quản lý" tuy
 * chạy được ngay mà KHÔNG cần sửa code, nhưng sẽ kéo theo tác dụng phụ ở
 * MỌI module khác dùng `department_id` (phạm vi xem Khách hàng theo phòng
 * ban của Manager, Báo cáo doanh số theo phòng ban, override phân quyền
 * theo `role_permissions.department_id`, badge/point cấu hình Quản lý phụ
 * trách...) - không an toàn nếu Assistant đó vẫn cần đứng tên phòng ban cũ
 * cho các mục đích khác.
 *
 * => Thêm 1 cột override TÁCH BIỆT HOÀN TOÀN khỏi `department_id`, CHỈ ảnh
 * hưởng đúng luồng duyệt/xem đơn nghỉ phép (`leave-requests.service.ts`),
 * không đụng tới bất kỳ module nào khác. `leave_approver_id` NULL (mặc định
 * cho toàn bộ user hiện có) = không có ngoại lệ, hệ thống chạy y hệt hôm
 * nay (rule phòng ban vẫn áp dụng bình thường). Khi Admin gán
 * `leave_approver_id` = id của 1 Manager cho 1 user cụ thể, Manager đó LUÔN
 * duyệt được đơn của user đó (kể cả khác/không có phòng ban) - xem thêm
 * đoạn code mới trong `LeaveRequestsService.isEligibleApprover()`.
 */
export class AddLeaveApproverOverrideToUsers1781700000000 implements MigrationInterface {
  name = 'AddLeaveApproverOverrideToUsers1781700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const usersTable = await queryRunner.getTable('users');

    // MySQL không hỗ trợ "ADD COLUMN IF NOT EXISTS" - kiểm tra tồn tại
    // trước qua getTable(), đúng pattern AddIsRootAdminToUsers/AddPositionsTable.
    if (!usersTable?.findColumnByName('leave_approver_id')) {
      await queryRunner.query(`
        ALTER TABLE users
        ADD COLUMN leave_approver_id INT NULL COMMENT 'Ngoại lệ: người (thường là Manager) luôn được duyệt/xem đơn nghỉ phép của user này, BẤT KỂ department_id - override tách biệt hoàn toàn khỏi phòng ban, chỉ ảnh hưởng module Nghỉ phép'
        AFTER department_id;
      `);
    }

    const hasFk = usersTable?.foreignKeys?.some((fk) => fk.name === 'fk_users_leave_approver');
    if (!hasFk) {
      await queryRunner.query(`
        ALTER TABLE users
        ADD CONSTRAINT fk_users_leave_approver FOREIGN KEY (leave_approver_id)
          REFERENCES users(id) ON DELETE SET NULL;
      `);
    }

    const hasIndex = usersTable?.indices?.some((idx) => idx.name === 'idx_users_leave_approver');
    if (!hasIndex) {
      await queryRunner.query(`
        CREATE INDEX idx_users_leave_approver ON users (leave_approver_id);
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const usersTable = await queryRunner.getTable('users');

    const hasFk = usersTable?.foreignKeys?.some((fk) => fk.name === 'fk_users_leave_approver');
    if (hasFk) {
      await queryRunner.query(`ALTER TABLE users DROP FOREIGN KEY fk_users_leave_approver;`);
    }

    const hasIndex = usersTable?.indices?.some((idx) => idx.name === 'idx_users_leave_approver');
    if (hasIndex) {
      await queryRunner.query(`DROP INDEX idx_users_leave_approver ON users;`);
    }

    if (usersTable?.findColumnByName('leave_approver_id')) {
      await queryRunner.query(`ALTER TABLE users DROP COLUMN leave_approver_id;`);
    }
  }
}
