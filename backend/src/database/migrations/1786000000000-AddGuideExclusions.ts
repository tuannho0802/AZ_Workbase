import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hướng dẫn: LOẠI TRỪ theo Role / Vị trí / Phòng ban (PLAN_GUIDES_CONTENT §2.6, P6).
 *
 * Thêm cột `is_excluded TINYINT(1) NOT NULL DEFAULT 0` vào `guide_roles`, `guide_positions`, `guide_departments`.
 * 0 = dòng "được xem" (như cũ - dữ liệu hiện có giữ nguyên ngữ nghĩa), 1 = dòng "loại trừ" (thắng "được xem").
 * Idempotent (hasColumn). `down()` XOÁ các dòng loại trừ trước khi bỏ cột - nếu không, chúng sẽ biến thành dòng "được xem"
 * và lặng lẽ đảo nghĩa (bài "mọi người trừ Media" thành "chỉ Media").
 */
export class AddGuideExclusions1786000000000 implements MigrationInterface {
  name = 'AddGuideExclusions1786000000000';

  private readonly tables = ['guide_roles', 'guide_positions', 'guide_departments'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      if (!(await queryRunner.hasColumn(table, 'is_excluded'))) {
        await queryRunner.query(`ALTER TABLE \`${table}\` ADD COLUMN \`is_excluded\` tinyint(1) NOT NULL DEFAULT 0;`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      if (await queryRunner.hasColumn(table, 'is_excluded')) {
        await queryRunner.query(`DELETE FROM \`${table}\` WHERE \`is_excluded\` = 1;`);
        await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN \`is_excluded\`;`);
      }
    }
  }
}
