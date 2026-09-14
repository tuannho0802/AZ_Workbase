import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 (bổ sung theo yêu cầu chủ dự án) - thêm cột `color` cho
 * `periodic_tasks`. Dùng CHỈ để hiển thị UI (Card/Kanban/Calendar...) sau
 * này, KHÔNG mang ý nghĩa nghiệp vụ, không ảnh hưởng RBAC/scope.
 *
 * Lưu dạng hex 6 ký tự bao gồm dấu '#' (vd '#FF5733') -> VARCHAR(7), nullable
 * (Task cũ/không set màu vẫn hợp lệ, FE tự quyết định màu mặc định khi hiển
 * thị nếu NULL).
 */
export class AddColorToPeriodicTasks1782200000000 implements MigrationInterface {
  name = 'AddColorToPeriodicTasks1782200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ⚠️ MySQL (khác MariaDB) KHÔNG hỗ trợ `ADD COLUMN IF NOT EXISTS` -
    // đây là nguyên nhân lỗi cú pháp ER_PARSE_ERROR 1064 khi chạy trên môi
    // trường MySQL thật. Thay bằng cách kiểm tra `table.findColumnByName()`
    // trước, chỉ ALTER khi cột chưa tồn tại - đúng pattern đã dùng ở
    // AddColorToRbacGroupingTables1781300000000 / AddEditCountToCustomerNotes1779500000000.
    const table = await queryRunner.getTable('periodic_tasks');
    const columnExists = table?.findColumnByName('color');

    if (!columnExists) {
      await queryRunner.query(`
        ALTER TABLE \`periodic_tasks\`
        ADD COLUMN \`color\` VARCHAR(7) NULL
        COMMENT 'Màu Task (hex, vd #FF5733) - chỉ dùng hiển thị UI'
        AFTER \`status_id\`;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('periodic_tasks');
    const columnExists = table?.findColumnByName('color');

    if (columnExists) {
      await queryRunner.query(`
        ALTER TABLE \`periodic_tasks\` DROP COLUMN \`color\`;
      `);
    }
  }
}