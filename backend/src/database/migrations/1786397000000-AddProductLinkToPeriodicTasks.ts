import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bảng Công việc kiểu sheet (Xem theo Ngày) - thêm cột `product_link` cho `periodic_tasks`:
 * link sản phẩm (video/tài liệu/bài đăng) của Công việc, KHÔNG bắt buộc (NULL = chưa có link).
 * Chỉ CỘNG THÊM 1 cột nullable -> dữ liệu cũ giữ nguyên, code cũ vẫn chạy.
 * ⚠️ MySQL KHÔNG hỗ trợ `ADD COLUMN IF NOT EXISTS` -> kiểm tra bằng getTable()/findColumnByName() (mẫu AddColorToPeriodicTasks).
 */
export class AddProductLinkToPeriodicTasks1786397000000 implements MigrationInterface {
  name = 'AddProductLinkToPeriodicTasks1786397000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('periodic_tasks');
    if (!table?.findColumnByName('product_link')) {
      await queryRunner.query(
        "ALTER TABLE `periodic_tasks` ADD COLUMN `product_link` VARCHAR(1000) NULL COMMENT 'Link sản phẩm của Công việc (http/https), không bắt buộc' AFTER `note`",
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('periodic_tasks');
    if (table?.findColumnByName('product_link')) {
      await queryRunner.query('ALTER TABLE `periodic_tasks` DROP COLUMN `product_link`');
    }
  }
}
