import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDetailedRbacPermissions1778600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('customers.manage', 'customers', 'manage', TRUE, 'Tạo mới, cập nhật thông tin chung khách hàng'),
      ('leave_requests.view', 'leave_requests', 'view', TRUE, 'Xem danh sách đơn nghỉ phép'),
      ('leave_requests.delete', 'leave_requests', 'delete', FALSE, 'Xoá đơn nghỉ phép'),
      ('users.view', 'users', 'view', TRUE, 'Xem danh sách và chi tiết nhân viên'),
      ('users.delete', 'users', 'delete', FALSE, 'Khoá/Xoá tài khoản nhân viên'),
      ('departments.view', 'departments', 'view', FALSE, 'Xem danh sách phòng ban'),
      ('departments.delete', 'departments', 'delete', FALSE, 'Xoá phòng ban'),
      ('link_groups.view', 'link_groups', 'view', FALSE, 'Xem danh sách Category và Group liên kết'),
      ('media_sources.view', 'media_sources', 'view', FALSE, 'Xem danh sách Nguồn Media'),
      ('audit.view', 'audit', 'view', FALSE, 'Xem danh sách Nhật ký hệ thống');
    `);

    // Assign view permissions broadly based on old static roles
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r, permissions p
      WHERE r.code IN ('admin', 'assistant', 'manager', 'employee') 
        AND p.key IN ('departments.view', 'link_groups.view', 'media_sources.view');
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, 'department' FROM roles r, permissions p
      WHERE r.code IN ('admin', 'assistant', 'manager') AND p.key = 'users.view';
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r, permissions p
      WHERE r.code IN ('admin', 'assistant') AND p.key = 'audit.view';
    `);

    // Assign manage permissions
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, 'department' FROM roles r, permissions p
      WHERE r.code IN ('admin', 'assistant', 'manager') AND p.key = 'customers.manage';
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, 'department' FROM roles r, permissions p
      WHERE r.code IN ('admin', 'assistant', 'manager') AND p.key = 'leave_requests.view';
    `);

    // Assign delete permissions only to admin
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r, permissions p
      WHERE r.code = 'admin' 
        AND p.key IN ('leave_requests.delete', 'users.delete', 'departments.delete');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM permissions WHERE \`key\` IN (
        'customers.manage', 'leave_requests.view', 'leave_requests.delete',
        'users.view', 'users.delete', 'departments.view', 'departments.delete',
        'link_groups.view', 'media_sources.view', 'audit.view'
      );
    `);
  }
}
