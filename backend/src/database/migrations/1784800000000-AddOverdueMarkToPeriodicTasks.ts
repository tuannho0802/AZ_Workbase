import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đánh dấu "Quá hạn" thủ công cho Công việc định kỳ: thêm 2 cột vào `periodic_tasks`
 * - `overdue_marked_at` (DATETIME NULL): khác NULL = Task đang bị đánh dấu quá hạn thủ công.
 * - `overdue_marked_by_id` (INT NULL, FK -> users, SET NULL): người đánh dấu gần nhất.
 * Không seed permission mới - dùng lại `periodic_tasks.approve` (admin/assistant=all, manager=department).
 * Kiểm tra tồn tại qua `getTable()` trước khi ALTER (MySQL không hỗ trợ ADD COLUMN IF NOT EXISTS).
 */
export class AddOverdueMarkToPeriodicTasks1784800000000 implements MigrationInterface {
  name = 'AddOverdueMarkToPeriodicTasks1784800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('periodic_tasks');

    if (!table?.findColumnByName('overdue_marked_at')) {
      await queryRunner.query(`
        ALTER TABLE \`periodic_tasks\`
        ADD COLUMN \`overdue_marked_at\` DATETIME NULL
        COMMENT 'Thời điểm đánh dấu Quá hạn thủ công (NULL = không đánh dấu)'
        AFTER \`lock_note\`;
      `);
    }

    if (!table?.findColumnByName('overdue_marked_by_id')) {
      await queryRunner.query(`
        ALTER TABLE \`periodic_tasks\`
        ADD COLUMN \`overdue_marked_by_id\` INT NULL
        COMMENT 'Người đánh dấu Quá hạn thủ công gần nhất'
        AFTER \`overdue_marked_at\`;
      `);
    }

    const hasFk = table?.foreignKeys?.some((fk) => fk.name === 'fk_periodic_tasks_overdue_marked_by');
    if (!hasFk) {
      await queryRunner.query(`
        ALTER TABLE \`periodic_tasks\`
        ADD CONSTRAINT \`fk_periodic_tasks_overdue_marked_by\` FOREIGN KEY (\`overdue_marked_by_id\`)
          REFERENCES \`users\`(\`id\`) ON DELETE SET NULL;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('periodic_tasks');

    if (table?.foreignKeys?.some((fk) => fk.name === 'fk_periodic_tasks_overdue_marked_by')) {
      await queryRunner.query(`ALTER TABLE \`periodic_tasks\` DROP FOREIGN KEY \`fk_periodic_tasks_overdue_marked_by\`;`);
    }
    for (const col of ['overdue_marked_by_id', 'overdue_marked_at']) {
      if (table?.findColumnByName(col)) {
        await queryRunner.query(`ALTER TABLE \`periodic_tasks\` DROP COLUMN \`${col}\`;`);
      }
    }
  }
}
