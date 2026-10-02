import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P7 (mở rộng) - Hướng dẫn hiển thị theo Position + Phòng ban (ngoài Role).
 *
 *  - `guide_positions`   : guide ↔ `positions.id`. KHÔNG có dòng nào = không giới hạn theo vị trí.
 *  - `guide_departments` : guide ↔ `departments.id`. KHÔNG có dòng nào = không giới hạn theo phòng ban.
 *
 * Quy tắc xem (AND giữa các chiều): với MỖI chiều (role / vị trí / phòng ban) đã được gán thì người xem phải
 * thuộc danh sách của chiều đó. Chiều để trống = không giới hạn. Idempotent (hasTable). `down()` xoá 2 bảng.
 */
export class AddGuidePositionsDepartments1785600000000 implements MigrationInterface {
  name = 'AddGuidePositionsDepartments1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('guide_positions'))) {
      await queryRunner.query(`
        CREATE TABLE \`guide_positions\` (
          \`guide_id\` int NOT NULL,
          \`position_id\` int NOT NULL,
          PRIMARY KEY (\`guide_id\`, \`position_id\`),
          KEY \`IDX_guide_positions_position\` (\`position_id\`),
          CONSTRAINT \`FK_guide_positions_guide\` FOREIGN KEY (\`guide_id\`) REFERENCES \`guides\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`FK_guide_positions_position\` FOREIGN KEY (\`position_id\`) REFERENCES \`positions\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }
    if (!(await queryRunner.hasTable('guide_departments'))) {
      await queryRunner.query(`
        CREATE TABLE \`guide_departments\` (
          \`guide_id\` int NOT NULL,
          \`department_id\` int NOT NULL,
          PRIMARY KEY (\`guide_id\`, \`department_id\`),
          KEY \`IDX_guide_departments_department\` (\`department_id\`),
          CONSTRAINT \`FK_guide_departments_guide\` FOREIGN KEY (\`guide_id\`) REFERENCES \`guides\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`FK_guide_departments_department\` FOREIGN KEY (\`department_id\`) REFERENCES \`departments\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('guide_departments')) {
      await queryRunner.query(`DROP TABLE \`guide_departments\`;`);
    }
    if (await queryRunner.hasTable('guide_positions')) {
      await queryRunner.query(`DROP TABLE \`guide_positions\`;`);
    }
  }
}
