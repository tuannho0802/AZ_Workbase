import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix bug thật phát hiện khi audit Phase 1+2 Position (xem WORKFLOW_LOG.md
 * 2026-09-10): `GET /positions` trước đây CHỈ gate bằng `positions.manage`
 * (Admin/Assistant) - Manager (scope='department' trên `users.manage`) và
 * Employee tự đăng ký (`POST /auth/register`) KHÔNG có cách nào list được
 * danh mục Position để chọn khi tạo/đăng ký tài khoản (403 với Manager, và
 * hoàn toàn không có endpoint public cho luồng đăng ký).
 *
 * Sửa đúng pattern đã có sẵn cho `departments.view`/`departments.manage`
 * (xem AddDetailedRbacPermissions1778600000000): tách permission ĐỌC riêng
 * biệt khỏi permission QUẢN LÝ (CRUD), gán `positions.view` cho CẢ 4 role
 * (admin, assistant, manager, employee) - vì đây chỉ là danh mục tham chiếu
 * (giống departments.view), không phải hành động nhạy cảm.
 *
 * `positions.manage` (CRUD Position) GIỮ NGUYÊN chỉ Admin/Assistant, không
 * đổi gì - xem AddPositionsTable1780300000000.
 */
export class AddPositionsViewPermission1780500000000
  implements MigrationInterface
{
  name = 'AddPositionsViewPermission1780500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('positions.view', 'positions', 'view', FALSE, 'Xem danh mục Vị trí (Position) - dùng cho dropdown khi tạo/sửa/đăng ký tài khoản')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL
      FROM roles r, permissions p
      WHERE p.key = 'positions.view'
        AND r.code IN ('admin', 'assistant', 'manager', 'employee');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE rp FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.key = 'positions.view';
    `);
    await queryRunner.query(`DELETE FROM permissions WHERE \`key\` = 'positions.view'`);
  }
}
