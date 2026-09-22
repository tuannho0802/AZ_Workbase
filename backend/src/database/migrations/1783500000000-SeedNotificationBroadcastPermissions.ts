import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * [M1] Seed 4 permission CRUD đầy đủ cho Thông báo THỦ CÔNG
 * (`notification_broadcasts.view/create/edit/delete`) - xem
 * `AZ-Workbase Skills/PLAN_NOTIFICATION_SYSTEM.md` mục 6.7 và
 * `AZ-Workbase Skills/PERMISSIONS.md` section "Thông báo (modules/notifications)".
 *
 * ⚠️ CỐ Ý LỆCH so với bảng nguyên tắc chung ở PERMISSIONS.md mục 1
 * ("Assistant = Admin trừ Xoá" áp dụng mọi module) - lý do: `scope` của
 * `notification_broadcasts.create` KHÔNG có nghĩa "phạm vi DỮ LIỆU được xem/sửa"
 * như mọi module khác, mà là "phạm vi NGƯỜI NHẬN được phép chọn" (own = không
 * ai / department = user thuộc phòng ban mình quản lý / all = mọi user +
 * "Toàn bộ nhân viên"). Cấp `all` mặc định cho Assistant tương đương cho phép
 * SPAM TOÀN CÔNG TY - rủi ro khác hẳn "xem được toàn bộ khách hàng". Vì vậy
 * CHỈ seed mặc định cho admin + manager; Admin có thể tự bật cho
 * assistant/employee qua trang "Phân quyền" nếu thực sự muốn (giữ đúng tinh
 * thần "mặc định là khởi tạo, Admin toàn quyền đổi lại" ở mục 2.12).
 *
 *   - create (gửi): admin=all, manager=department (không có "Toàn bộ" ở FE cho
 *     Manager - vẫn phải kiểm lại ở BE, xem `broadcast-audience.resolver.ts`)
 *   - view (xem lịch sử đã gửi): admin=all, manager=own (chỉ lần do chính
 *     mình gửi - KHÔNG phải "department" như các module khác)
 *   - edit (sửa nội dung lần đã gửi): admin=all, manager=own (mirror view)
 *   - delete (xoá hẳn 1 lần gửi khỏi mọi hộp thư): CHỈ admin=all - mirror
 *     đúng quy ước "chỉ Admin xoá" đã áp dụng cho
 *     customers.delete/leave_requests.delete/periodic_tasks.delete.
 */
export class SeedNotificationBroadcastPermissions1783500000000
  implements MigrationInterface
{
  name = 'SeedNotificationBroadcastPermissions1783500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('notification_broadcasts.view', 'notification_broadcasts', 'view', TRUE, 'Xem lịch sử Thông báo thủ công đã gửi + tiến độ đọc/chưa đọc'),
      ('notification_broadcasts.create', 'notification_broadcasts', 'create', TRUE, 'Soạn & gửi Thông báo thủ công. Scope giới hạn PHẠM VI NGƯỜI NHẬN (không phải phạm vi dữ liệu): department = chỉ user thuộc phòng ban mình quản lý, không có "Toàn bộ"; all = mọi user + "Toàn bộ nhân viên"'),
      ('notification_broadcasts.edit', 'notification_broadcasts', 'edit', TRUE, 'Sửa tiêu đề/nội dung 1 lần gửi đã tồn tại - người nhận thấy nhãn "Đã chỉnh sửa"'),
      ('notification_broadcasts.delete', 'notification_broadcasts', 'delete', TRUE, 'Xoá hẳn 1 lần gửi - XOÁ LUÔN thông báo khỏi mọi hộp thư người nhận (không phải chỉ ẩn) - chỉ Admin')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    // view + edit: admin=all, manager=own (chỉ lần do chính mình gửi).
    for (const action of ['view', 'edit']) {
      await queryRunner.query(
        `
        INSERT INTO role_permissions (role_id, permission_id, scope)
        SELECT r.id, p.id,
          CASE r.code
            WHEN 'admin' THEN 'all'
            WHEN 'manager' THEN 'own'
          END
        FROM roles r, permissions p
        WHERE r.code IN ('admin', 'manager')
          AND p.\`key\` = ?;
        `,
        [`notification_broadcasts.${action}`],
      );
    }

    // create (gửi): admin=all, manager=department (giới hạn NGƯỜI NHẬN, không
    // phải dữ liệu - xem JSDoc đầu file).
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id,
        CASE r.code
          WHEN 'admin' THEN 'all'
          WHEN 'manager' THEN 'department'
        END
      FROM roles r, permissions p
      WHERE r.code IN ('admin', 'manager')
        AND p.\`key\` = 'notification_broadcasts.create';
    `);

    // delete: CHỈ admin.
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, 'all' FROM roles r, permissions p
      WHERE r.code = 'admin' AND p.\`key\` = 'notification_broadcasts.delete';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE rp FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.\`key\` IN (
        'notification_broadcasts.view', 'notification_broadcasts.create',
        'notification_broadcasts.edit', 'notification_broadcasts.delete'
      );
    `);
    await queryRunner.query(`
      DELETE FROM permissions WHERE \`key\` IN (
        'notification_broadcasts.view', 'notification_broadcasts.create',
        'notification_broadcasts.edit', 'notification_broadcasts.delete'
      );
    `);
  }
}
