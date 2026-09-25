import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * YÊU CẦU NGƯỜI DÙNG: "Thêm chức năng xoá mềm và xoá thật các đơn nghỉ phép
 * (Phân quyền theo Scope, Mặc định chỉ Admin)".
 *
 * `leave_requests.delete` ĐÃ tồn tại từ `1778600000000-AddDetailedRbacPermissions`
 * nhưng khai `supports_scope=FALSE` (quyền nhị phân, chỉ admin, scope luôn
 * NULL) - đổi sang `supports_scope=TRUE` để mirror ĐÚNG cơ chế scope-based
 * của `leave_requests.approve`/`leave_requests.edit` (admin -> scope='all',
 * Admin có thể mở rộng cho Manager -> scope='department' sau này qua trang
 * "Phân quyền" mà KHÔNG cần thêm migration - xem `isEligibleApprover()`,
 * dùng LẠI đúng hàm đó cho `softDelete()`/`restoreFromTrash()`).
 *
 * "Mặc định chỉ Admin": CHỈ update dòng `role_permissions` đã có sẵn của
 * `admin` (scope NULL -> 'all') - KHÔNG seed thêm dòng nào cho
 * manager/assistant/employee (khác hẳn `leave_requests.edit` vốn seed cả
 * 3 role) - đúng yêu cầu "mặc định CHỈ Admin", Admin tự bật thêm role khác
 * qua UI nếu muốn.
 *
 * `leave_requests.hard_delete` (XOÁ VĨNH VIỄN, không thể hoàn tác) là
 * permission MỚI, TÁCH RIÊNG khỏi `leave_requests.delete` - mirror ĐÚNG
 * `customers.hard_delete` (`SplitCustomersHardDeletePermission`). Cũng
 * `supports_scope=TRUE` nhưng Service (`LeaveRequestsService.hardDelete()`)
 * CHỈ chấp nhận scope='all' (Root Admin bypass ở Guard trả scope='all' sẵn) -
 * scope='department' dù được Admin lỡ cấp qua UI cũng KHÔNG đủ để xoá vĩnh
 * viễn, an toàn hơn 1 bậc cho hành động không thể hoàn tác.
 */
export class SeedLeaveRequestsDeletePermissions1784800000000
  implements MigrationInterface
{
  name = 'SeedLeaveRequestsDeletePermissions1784800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. `leave_requests.delete` -> supports_scope = TRUE
    await queryRunner.query(`
      UPDATE permissions
      SET supports_scope = TRUE,
          description = 'Xoá mềm đơn nghỉ phép (đưa vào thùng rác) + xem/khôi phục thùng rác - mặc định chỉ Admin, có thể mở rộng theo phòng ban qua trang Phân quyền'
      WHERE \`key\` = 'leave_requests.delete';
    `);

    // 2. Dòng role_permissions hiện có của admin (scope NULL, seed từ
    // 1778600000000) -> 'all'. Dùng UPDATE (không phải INSERT) vì dòng này
    // đã tồn tại sẵn.
    await queryRunner.query(`
      UPDATE role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      SET rp.scope = 'all'
      WHERE r.code = 'admin' AND p.\`key\` = 'leave_requests.delete';
    `);

    // Phòng trường hợp môi trường nào đó CHƯA có dòng role_permissions cho
    // admin (dữ liệu lệch) - thêm mới nếu còn thiếu, không phụ thuộc hoàn
    // toàn vào UPDATE ở trên.
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, 'all'
      FROM roles r, permissions p
      WHERE r.code = 'admin' AND p.\`key\` = 'leave_requests.delete'
        AND NOT EXISTS (
          SELECT 1 FROM role_permissions rp
          WHERE rp.role_id = r.id AND rp.permission_id = p.id
        );
    `);

    // 3. Permission MỚI - xoá vĩnh viễn, mặc định chỉ Admin.
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('leave_requests.hard_delete', 'leave_requests', 'hard_delete', TRUE,
       'Xoá VĨNH VIỄN đơn nghỉ phép đã ở trong thùng rác (KHÔNG thể khôi phục) - mặc định chỉ Admin, CHỈ scope=all mới xoá được dù được cấp thêm qua Phân quyền')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, 'all'
      FROM roles r, permissions p
      WHERE r.code = 'admin' AND p.\`key\` = 'leave_requests.hard_delete'
        AND NOT EXISTS (
          SELECT 1 FROM role_permissions rp
          WHERE rp.role_id = r.id AND rp.permission_id = p.id
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE rp FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.\`key\` = 'leave_requests.hard_delete';
    `);
    await queryRunner.query(`DELETE FROM permissions WHERE \`key\` = 'leave_requests.hard_delete';`);

    await queryRunner.query(`
      UPDATE role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      SET rp.scope = NULL
      WHERE r.code = 'admin' AND p.\`key\` = 'leave_requests.delete';
    `);
    await queryRunner.query(`
      UPDATE permissions
      SET supports_scope = FALSE,
          description = 'Xoá đơn nghỉ phép'
      WHERE \`key\` = 'leave_requests.delete';
    `);
  }
}
