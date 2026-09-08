import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm cột `edit_count` vào `customer_notes` - đếm số lần ghi chú đã được
 * SỬA (KHÔNG tính lần tạo đầu tiên) - phục vụ yêu cầu UI hiển thị "Đã sửa N
 * lần" bên cạnh thời gian sửa cuối, bất kể người sửa cuối có phải chính
 * người tạo hay không (khác với cột `updated_by` chỉ dùng để hiện TÊN người
 * sửa khi khác người tạo - xem `1779300000000-AddUpdatedByToCustomerNotes`).
 *
 * Mặc định 0 = chưa từng sửa lần nào kể từ khi tạo. Tăng dần mỗi lần
 * `CustomersService.updateNote()` chạy thành công - xem service.
 */
export class AddEditCountToCustomerNotes1779500000000
  implements MigrationInterface
{
  name = 'AddEditCountToCustomerNotes1779500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ⚠️ MySQL (khác MariaDB) KHÔNG hỗ trợ `ADD COLUMN IF NOT EXISTS` -
    // đây là nguyên nhân lỗi cú pháp ER_PARSE_ERROR 1064 khi chạy trên môi
    // trường MySQL thật. Thay bằng cách kiểm tra INFORMATION_SCHEMA.COLUMNS
    // trước, chỉ ALTER khi cột chưa tồn tại (giữ đúng tinh thần "an toàn
    // với môi trường đã có" của quy ước SKILL_DATABASE_MANAGEMENT.md, chỉ
    // đổi cách hiện thực cho tương thích MySQL).
    const table = await queryRunner.getTable('customer_notes');
    const columnExists = table?.findColumnByName('edit_count');

    if (!columnExists) {
      await queryRunner.query(
        `ALTER TABLE \`customer_notes\`
         ADD COLUMN \`edit_count\` INT NOT NULL DEFAULT 0
         COMMENT 'Số lần ghi chú đã được sửa (không tính lần tạo đầu tiên)'
         AFTER \`updated_by\``,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`customer_notes\` DROP COLUMN \`edit_count\``,
    );
  }
}