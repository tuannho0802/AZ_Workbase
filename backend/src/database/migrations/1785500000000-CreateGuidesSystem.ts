import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLAN_HARDENING P7 - Hướng dẫn sử dụng động.
 *
 *  - `guides`      : bài hướng dẫn (Markdown), xoá mềm (`deleted_at`).
 *  - `guide_roles` : guide hiển thị cho những role nào. KHÔNG có dòng nào = mọi role đăng nhập đều thấy.
 *  - Seed permission `guides.manage` (nhị phân): tạo/sửa/xoá/xuất bản. Mặc định CHỈ role `admin` (Toàn cục).
 *    Xem guide KHÔNG cần permission riêng. Root Admin luôn bypass ở PermissionGuard.
 *
 * `slug` UNIQUE tính cả bản ghi đã xoá mềm -> service đổi slug của bản ghi bị xoá (`deleted-<id>-<slug>`)
 * để slug cũ dùng lại được. `content` là MEDIUMTEXT (TEXT chỉ ~65KB, tiếng Việt UTF-8 dễ vượt).
 * Idempotent (hasTable / ON DUPLICATE KEY / NOT EXISTS). `down()` xoá bảng + permission theo key.
 */
export class CreateGuidesSystem1785500000000 implements MigrationInterface {
  name = 'CreateGuidesSystem1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('guides'))) {
      await queryRunner.query(`
        CREATE TABLE \`guides\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`title\` varchar(200) NOT NULL,
          \`slug\` varchar(150) NOT NULL,
          \`content\` mediumtext NOT NULL,
          \`sort_order\` int NOT NULL DEFAULT 0,
          \`is_published\` tinyint NOT NULL DEFAULT 0,
          \`created_by\` int NULL,
          \`updated_by\` int NULL,
          \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          \`deleted_at\` timestamp NULL,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_guides_slug\` (\`slug\`),
          KEY \`IDX_guides_published_sort\` (\`is_published\`, \`sort_order\`),
          KEY \`IDX_guides_deleted_at\` (\`deleted_at\`),
          CONSTRAINT \`FK_guides_created_by\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`FK_guides_updated_by\` FOREIGN KEY (\`updated_by\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    if (!(await queryRunner.hasTable('guide_roles'))) {
      await queryRunner.query(`
        CREATE TABLE \`guide_roles\` (
          \`guide_id\` int NOT NULL,
          \`role_id\` int NOT NULL,
          PRIMARY KEY (\`guide_id\`, \`role_id\`),
          KEY \`IDX_guide_roles_role\` (\`role_id\`),
          CONSTRAINT \`FK_guide_roles_guide\` FOREIGN KEY (\`guide_id\`) REFERENCES \`guides\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`FK_guide_roles_role\` FOREIGN KEY (\`role_id\`) REFERENCES \`roles\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('guides.manage', 'guides', 'manage', FALSE, 'Quản lý Hướng dẫn sử dụng: tạo/sửa/xoá/xuất bản và chọn role được xem - mặc định chỉ Admin. Xem guide đã xuất bản không cần quyền này')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope, department_id)
      SELECT r.id, p.id, NULL, NULL
      FROM roles r, permissions p
      WHERE r.code = 'admin' AND p.\`key\` = 'guides.manage'
        AND NOT EXISTS (
          SELECT 1 FROM role_permissions x
          WHERE x.role_id = r.id AND x.permission_id = p.id
            AND x.department_id IS NULL AND x.position_id IS NULL
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE rp FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.\`key\` = 'guides.manage';
    `);
    await queryRunner.query(`DELETE FROM permissions WHERE \`key\` = 'guides.manage'`);
    if (await queryRunner.hasTable('guide_roles')) {
      await queryRunner.query(`DROP TABLE \`guide_roles\`;`);
    }
    if (await queryRunner.hasTable('guides')) {
      await queryRunner.query(`DROP TABLE \`guides\`;`);
    }
  }
}
