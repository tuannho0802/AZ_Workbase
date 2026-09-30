import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * UTM: thêm `locked_at` (thời điểm khoá gần nhất) để tab "UTM đã khoá" sắp xếp đúng theo lúc khoá.
 * Nguồn sự thật "khoá hay không" vẫn là `is_active`; `locked_at` chỉ có nghĩa khi is_active = 0.
 * Backfill UTM đang khoá = updated_at (xấp xỉ tốt nhất hiện có).
 *
 * MySQL (khác MariaDB) KHÔNG hỗ trợ `ADD/DROP COLUMN IF [NOT] EXISTS` -> kiểm tra bằng hasColumn().
 */
export class AddLockedAtToUtms1785300000000 implements MigrationInterface {
  name = 'AddLockedAtToUtms1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('utms', 'locked_at'))) {
      await queryRunner.query(`ALTER TABLE \`utms\` ADD COLUMN \`locked_at\` timestamp NULL DEFAULT NULL AFTER \`is_active\``);
    }
    await queryRunner.query(`UPDATE \`utms\` SET \`locked_at\` = \`updated_at\` WHERE \`is_active\` = 0 AND \`locked_at\` IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('utms', 'locked_at')) {
      await queryRunner.query(`ALTER TABLE \`utms\` DROP COLUMN \`locked_at\``);
    }
  }
}