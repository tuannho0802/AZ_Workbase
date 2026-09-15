import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 5 (1/1) của module "Công việc định kỳ" - xem
 * `AZ-Workbase Skills/PLAN_PERIODIC_TASKS_MODULE.md` mục 2.9 (nguyên tắc
 * khoá/mở khoá) + mục 3 (schema) + mục 4 (permission) + mục 6 (Phase 5).
 *
 * 1. Thêm 4 cột lock vào `periodic_tasks`: `is_locked` (BOOLEAN), `locked_by_id`
 *    (FK -> users, SET NULL), `locked_at` (DATETIME), `lock_note` (VARCHAR).
 *    Dùng `getTable().findColumnByName()`/`foreignKeys`/`indices` để kiểm tra
 *    tồn tại trước khi ALTER - MySQL (khác MariaDB) KHÔNG hỗ trợ
 *    `ADD COLUMN IF NOT EXISTS`/`ADD CONSTRAINT IF NOT EXISTS` (từng gây lỗi
 *    cú pháp ER_PARSE_ERROR 1064 thật, xem `AddColorToPeriodicTasks`/
 *    `AddLeaveApproverOverrideToUsers`) - ĐÍNH CHÍNH lại hướng dẫn cũ ở
 *    `SKILL_DATABASE_MANAGEMENT.md` mục 5 ("LUÔN dùng IF NOT EXISTS") cho
 *    đúng với MySQL thật đang chạy trên môi trường dự án.
 * 2. Seed permission scoped `periodic_tasks.approve` (bật/tắt `is_locked`, 2
 *    chiều tự do) - admin=all, assistant=all, manager=department, employee
 *    KHÔNG seed (mirror `periodic_tasks.view/create/edit`).
 * 3. Seed permission NHỊ PHÂN `periodic_tasks.edit_locked` ("vượt rào" sửa
 *    Task dù đang khoá) - CHỈ seed cho admin (mirror `periodic_tasks.link_
 *    customer` về cách khai `supports_scope = FALSE`, khác ở chỗ mặc định
 *    CHỈ Admin, không kèm assistant).
 */
export class AddPeriodicTaskLockColumns1782600000000 implements MigrationInterface {
  name = 'AddPeriodicTaskLockColumns1782600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('periodic_tasks');

    if (!table?.findColumnByName('is_locked')) {
      await queryRunner.query(`
        ALTER TABLE \`periodic_tasks\`
        ADD COLUMN \`is_locked\` BOOLEAN NOT NULL DEFAULT FALSE
        COMMENT 'Khoá/mở khoá - 2 chiều tự do, không phải workflow 1 chiều (PLAN mục 2.9)'
        AFTER \`note\`;
      `);
    }

    if (!table?.findColumnByName('locked_by_id')) {
      await queryRunner.query(`
        ALTER TABLE \`periodic_tasks\`
        ADD COLUMN \`locked_by_id\` INT NULL
        COMMENT 'Người thực hiện lần khoá/mở khoá gần nhất'
        AFTER \`is_locked\`;
      `);
    }

    if (!table?.findColumnByName('locked_at')) {
      await queryRunner.query(`
        ALTER TABLE \`periodic_tasks\`
        ADD COLUMN \`locked_at\` DATETIME NULL
        COMMENT 'Thời điểm khoá/mở khoá gần nhất'
        AFTER \`locked_by_id\`;
      `);
    }

    if (!table?.findColumnByName('lock_note')) {
      await queryRunner.query(`
        ALTER TABLE \`periodic_tasks\`
        ADD COLUMN \`lock_note\` VARCHAR(500) NULL
        COMMENT 'Ghi chú lúc khoá - optional, không bắt buộc lý do (PLAN mục 2.9)'
        AFTER \`locked_at\`;
      `);
    }

    const hasFk = table?.foreignKeys?.some((fk) => fk.name === 'fk_periodic_tasks_locked_by');
    if (!hasFk) {
      await queryRunner.query(`
        ALTER TABLE \`periodic_tasks\`
        ADD CONSTRAINT \`fk_periodic_tasks_locked_by\` FOREIGN KEY (\`locked_by_id\`)
          REFERENCES \`users\`(\`id\`) ON DELETE SET NULL;
      `);
    }

    const hasIndex = table?.indices?.some((idx) => idx.name === 'idx_periodic_tasks_is_locked');
    if (!hasIndex) {
      await queryRunner.query(`
        CREATE INDEX \`idx_periodic_tasks_is_locked\` ON \`periodic_tasks\` (\`is_locked\`);
      `);
    }

    // ── Seed permission ──
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('periodic_tasks.approve', 'periodic_tasks', 'approve', TRUE, 'Bật/tắt khoá (is_locked) Công việc định kỳ - 2 chiều tự do'),
      ('periodic_tasks.edit_locked', 'periodic_tasks', 'edit_locked', FALSE, 'Vượt rào - được sửa Công việc định kỳ dù đang bị khoá')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    // approve: admin=all, assistant=all, manager=department. employee KHÔNG
    // seed (mirror view/create/edit nhưng bỏ dòng employee - PLAN mục 4).
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id,
        CASE r.code
          WHEN 'admin' THEN 'all'
          WHEN 'assistant' THEN 'all'
          WHEN 'manager' THEN 'department'
        END
      FROM roles r, permissions p
      WHERE r.code IN ('admin', 'assistant', 'manager')
        AND p.\`key\` = 'periodic_tasks.approve';
    `);

    // edit_locked: CHỈ Admin (nhị phân, scope=NULL).
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r, permissions p
      WHERE r.code = 'admin' AND p.\`key\` = 'periodic_tasks.edit_locked';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE rp FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.\`key\` IN ('periodic_tasks.approve', 'periodic_tasks.edit_locked');
    `);
    await queryRunner.query(`
      DELETE FROM permissions WHERE \`key\` IN ('periodic_tasks.approve', 'periodic_tasks.edit_locked');
    `);

    const table = await queryRunner.getTable('periodic_tasks');

    const hasIndex = table?.indices?.some((idx) => idx.name === 'idx_periodic_tasks_is_locked');
    if (hasIndex) {
      await queryRunner.query(`DROP INDEX \`idx_periodic_tasks_is_locked\` ON \`periodic_tasks\`;`);
    }

    const hasFk = table?.foreignKeys?.some((fk) => fk.name === 'fk_periodic_tasks_locked_by');
    if (hasFk) {
      await queryRunner.query(`ALTER TABLE \`periodic_tasks\` DROP FOREIGN KEY \`fk_periodic_tasks_locked_by\`;`);
    }

    for (const col of ['lock_note', 'locked_at', 'locked_by_id', 'is_locked']) {
      if (table?.findColumnByName(col)) {
        await queryRunner.query(`ALTER TABLE \`periodic_tasks\` DROP COLUMN \`${col}\`;`);
      }
    }
  }
}
