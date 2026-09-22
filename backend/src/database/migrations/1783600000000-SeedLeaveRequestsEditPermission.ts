import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed permission `leave_requests.edit` - cho phép "sửa hộ" 1 đơn nghỉ phép
 * (PENDING/APPROVED) khi User báo lỡ set sai ngày sau khi đã gửi (hoặc đã
 * được duyệt rồi) - xem `LeaveRequestsService.update()` và
 * `AZ-Workbase Skills/PERMISSIONS.md` mục 2.6.
 *
 * Tách hẳn khỏi `leave_requests.approve` (dù cùng dùng chung rule role-cặp
 * `isEligibleApprover`) vì đây là 2 hành động khác nhau về ngữ nghĩa (duyệt/
 * từ chối đơn PENDING vs sửa nội dung đơn) - Admin có thể muốn bật/tắt độc
 * lập qua trang "Phân quyền" (vd 1 Manager được duyệt đơn nhưng KHÔNG được tự
 * ý sửa ngày đơn người khác).
 *
 * Mirror ĐÚNG default scope đã seed cho `leave_requests.approve`
 * (`1778400000000-AddCustomRbacSystem.ts`): admin=all, manager=department,
 * assistant=all, employee=không có (không seed dòng nào cho employee).
 */
export class SeedLeaveRequestsEditPermission1783600000000
  implements MigrationInterface
{
  name = 'SeedLeaveRequestsEditPermission1783600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('leave_requests.edit', 'leave_requests', 'edit', TRUE, 'Sửa ngày/loại phép/lý do của 1 đơn nghỉ phép đã tồn tại (PENDING/APPROVED) - dùng khi User báo lỡ set sai ngày')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id,
        CASE r.code
          WHEN 'admin' THEN 'all'
          WHEN 'manager' THEN 'department'
          WHEN 'assistant' THEN 'all'
        END
      FROM roles r, permissions p
      WHERE r.code IN ('admin', 'manager', 'assistant')
        AND p.\`key\` = 'leave_requests.edit';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE rp FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.\`key\` = 'leave_requests.edit';
    `);
    await queryRunner.query(`
      DELETE FROM permissions WHERE \`key\` = 'leave_requests.edit';
    `);
  }
}
