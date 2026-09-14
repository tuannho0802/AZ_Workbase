import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 (3/3) của module "Công việc định kỳ" - xem
 * `AZ-Workbase Skills/PLAN_PERIODIC_TASKS_MODULE.md` mục 4 (permission
 * catalogue) + mục 6 (Phase 1).
 *
 * Seed 4 permission `periodic_tasks.view/create/edit/delete` (đều
 * `supports_scope = TRUE`, scope own/department/all - mirror ĐÚNG khuôn
 * `customers.view/create/edit/delete`). Giá trị seed CHỈ là khởi tạo mặc
 * định (Admin toàn quyền đổi lại qua `/phan-quyen` sau khi migrate - đúng
 * PLAN mục 2.12):
 *   - view/create/edit: admin=all, assistant=all, manager=department, employee=own
 *   - delete: CHỈ admin=all (không seed cho 3 role còn lại, đúng quy ước
 *     "chỉ Admin xoá" đã áp dụng cho customers.delete/leave_requests.delete)
 *
 * ⚠️ Các permission còn lại trong bảng ở PLAN mục 4
 * (`periodic_tasks.link_customer/approve/edit_locked`) thuộc Phase 3/5,
 * KHÔNG seed ở đây - cố tình để giữ Phase 1 nhỏ.
 */
export class SeedPeriodicTasksPermissions1782100000000 implements MigrationInterface {
  name = 'SeedPeriodicTasksPermissions1782100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('periodic_tasks.view', 'periodic_tasks', 'view', TRUE, 'Xem danh sách/chi tiết Công việc định kỳ'),
      ('periodic_tasks.create', 'periodic_tasks', 'create', TRUE, 'Tạo Công việc định kỳ mới (thủ công)'),
      ('periodic_tasks.edit', 'periodic_tasks', 'edit', TRUE, 'Sửa Công việc định kỳ, đổi trạng thái, gán chính/phụ, liên kết cha-con'),
      ('periodic_tasks.delete', 'periodic_tasks', 'delete', TRUE, 'Xoá mềm Công việc định kỳ - chỉ Admin')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    // view/create/edit: admin=all, assistant=all, manager=department, employee=own.
    for (const action of ['view', 'create', 'edit']) {
      await queryRunner.query(
        `
        INSERT INTO role_permissions (role_id, permission_id, scope)
        SELECT r.id, p.id,
          CASE r.code
            WHEN 'admin' THEN 'all'
            WHEN 'assistant' THEN 'all'
            WHEN 'manager' THEN 'department'
            WHEN 'employee' THEN 'own'
          END
        FROM roles r, permissions p
        WHERE r.code IN ('admin', 'assistant', 'manager', 'employee')
          AND p.\`key\` = ?;
        `,
        [`periodic_tasks.${action}`],
      );
    }

    // delete: CHỈ Admin (mirror customers.delete/leave_requests.delete).
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, 'all' FROM roles r, permissions p
      WHERE r.code = 'admin' AND p.\`key\` = 'periodic_tasks.delete';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE rp FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.\`key\` IN (
        'periodic_tasks.view', 'periodic_tasks.create', 'periodic_tasks.edit', 'periodic_tasks.delete'
      );
    `);
    await queryRunner.query(`
      DELETE FROM permissions WHERE \`key\` IN (
        'periodic_tasks.view', 'periodic_tasks.create', 'periodic_tasks.edit', 'periodic_tasks.delete'
      );
    `);
  }
}
