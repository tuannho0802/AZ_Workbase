import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thùng rác Công việc định kỳ (xem + xoá VĨNH VIỄN Task đã xoá mềm, gồm cả
 * "dọn sạch thùng rác"): 1 permission NHỊ PHÂN duy nhất
 * `periodic_tasks.trash_manage` (supports_scope=FALSE) - mirror
 * `customers.trash_manage`. Mặc định CHỈ role `admin` (scope NULL); Admin có
 * thể cấp thêm cho role khác ở trang Phân quyền. Không đụng permission nào khác.
 *
 * Idempotent: INSERT ... ON DUPLICATE KEY + INSERT IGNORE-style (NOT EXISTS) để
 * chạy lại an toàn trên môi trường đã có sẵn.
 */
export class SeedPeriodicTasksTrashManagePermission1784300000000 implements MigrationInterface {
  name = 'SeedPeriodicTasksTrashManagePermission1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('periodic_tasks.trash_manage', 'periodic_tasks', 'trash_manage', FALSE,
       'Quản lý thùng rác Công việc định kỳ: xem Task đã xoá mềm, xoá vĩnh viễn và dọn sạch thùng rác (KHÔNG thể khôi phục) - mặc định chỉ Admin')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL
      FROM roles r, permissions p
      WHERE r.code = 'admin'
        AND p.\`key\` = 'periodic_tasks.trash_manage'
        AND NOT EXISTS (
          SELECT 1 FROM role_permissions rp
          WHERE rp.role_id = r.id AND rp.permission_id = p.id
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Xoá permission tự CASCADE xoá role_permissions liên quan (FK ON DELETE CASCADE).
    await queryRunner.query(`DELETE FROM permissions WHERE \`key\` = 'periodic_tasks.trash_manage'`);
  }
}
