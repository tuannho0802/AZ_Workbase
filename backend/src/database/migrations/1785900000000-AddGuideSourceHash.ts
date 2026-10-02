import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0 - `guides:sync` (nguồn nội dung = file `guides-content/*.md`).
 *
 * Thêm `guides.source_hash` (SHA-256 hex, NULL được): hash của bài ở lần `guides:sync --apply` gần nhất. Nhờ nó script phân biệt được
 * "file đã đổi" (ghi đè an toàn) với "ai đó đã sửa tay bài trên UI" (báo xung đột, không ghi đè nếu thiếu --force).
 * NULL = bài tạo tay chưa từng đồng bộ -> hành vi cũ không đổi. KHÔNG đụng dữ liệu nào hiện có.
 *
 * Idempotent (hasColumn). `down()` chỉ bỏ cột mới.
 */
export class AddGuideSourceHash1785900000000 implements MigrationInterface {
  name = 'AddGuideSourceHash1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('guides', 'source_hash'))) {
      await queryRunner.query(`ALTER TABLE \`guides\` ADD COLUMN \`source_hash\` varchar(64) NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('guides', 'source_hash')) {
      await queryRunner.query(`ALTER TABLE \`guides\` DROP COLUMN \`source_hash\``);
    }
  }
}
