import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Quyền `users.sessions`: xem thiết bị đang đăng nhập của NGƯỜI KHÁC + đăng xuất cưỡng bức (P5).
 * Trước đây gate bằng `users.manage` (Admin/Assistant/Manager đều có) -> tách riêng, MẶC ĐỊNH CHỈ role `admin`
 * (scope 'all'). Admin cấp thêm cho role khác qua trang Phân quyền (hỗ trợ scope all/department + override phòng ban).
 * Idempotent: ON DUPLICATE KEY + NOT EXISTS.
 */
export class AddUsersSessionsPermission1786335000000 implements MigrationInterface {
    name = 'AddUsersSessionsPermission1786335000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('users.sessions', 'users', 'sessions', TRUE, 'Xem thiết bị đang đăng nhập của người khác và đăng xuất cưỡng bức')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);
        await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, 'all'
      FROM roles r, permissions p
      WHERE r.code = 'admin' AND p.key = 'users.sessions'
        AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id AND rp.department_id IS NULL);
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      DELETE rp FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE p.key = 'users.sessions';
    `);
        await queryRunner.query(`DELETE FROM permissions WHERE \`key\` = 'users.sessions'`);
    }
}