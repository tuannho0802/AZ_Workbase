import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm cột `color` (mã màu hex, vd '#1890ff') cho 4 bảng "nhóm/phân loại"
 * dùng để hiển thị Tag màu ngoài FE: `assignment_group_configs`, `positions`,
 * `roles`, `departments`.
 *
 * Bối cảnh: trước đây FE code cứng 1 màu Tag duy nhất (vd luôn `color="blue"`)
 * cho tất cả các dòng của từng bảng này (xem `vi-tri/page.tsx`,
 * `quan-ly-phu-trach/page.tsx`, `phan-quyen/page.tsx`...) - khi số lượng
 * phòng ban/role/vị trí/nhóm phụ trách tăng lên, tất cả các Tag đều cùng 1
 * màu, không phân biệt được bằng mắt. Cột `color` này cho phép Admin tự chọn
 * màu riêng cho từng dòng qua UI (implement ở phase sau - phase này CHỈ làm
 * migration + BE, action `color` ở DTO là OPTIONAL để không phá các API
 * client cũ chưa gửi field này).
 *
 * `color` NOT NULL với DEFAULT '#1890ff' (đúng màu xanh dương mặc định của
 * Ant Design `Tag color="blue"` / theme `colorPrimary` hiện tại - xem
 * `app/layout.tsx`) để:
 *   1. Dữ liệu cũ (toàn bộ dòng hiện có) giữ NGUYÊN hành vi hiển thị hôm nay
 *      (tất cả cùng màu xanh mặc định) - không đổi UI đột ngột khi migration
 *      chạy xong nhưng FE mới chưa deploy.
 *   2. FE tương lai luôn có giá trị hợp lệ để render Tag ngay, không cần
 *      thêm logic fallback `color ?? 'blue'` ở mọi nơi.
 *
 * MySQL KHÔNG hỗ trợ `ADD COLUMN IF NOT EXISTS` - dùng lại đúng pattern
 * `table.findColumnByName()` đã áp dụng ở AddPositionsTable1780300000000 /
 * AddEditCountToCustomerNotes1779500000000 để migration idempotent.
 */
export class AddColorToRbacGroupingTables1781300000000 implements MigrationInterface {
  name = 'AddColorToRbacGroupingTables1781300000000';

  private readonly tables = ['assignment_group_configs', 'positions', 'roles', 'departments'];
  private readonly defaultColor = '#1890ff';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of this.tables) {
      const table = await queryRunner.getTable(tableName);
      if (!table) {
        // An toàn: nếu 1 trong 4 bảng vì lý do gì đó chưa tồn tại trên môi
        // trường đang chạy migration (không nên xảy ra ở prod, nhưng có thể
        // xảy ra khi 10 tài khoản chạy song song trên các nhánh DB khác
        // nhau), bỏ qua thay vì throw để không chặn migration của bảng khác.
        continue;
      }
      if (!table.findColumnByName('color')) {
        await queryRunner.query(
          `ALTER TABLE \`${tableName}\` ADD COLUMN \`color\` VARCHAR(20) NOT NULL DEFAULT '${this.defaultColor}' COMMENT 'Mã màu hex hiển thị Tag ngoài FE, vd #1890ff';`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of this.tables) {
      const table = await queryRunner.getTable(tableName);
      if (table?.findColumnByName('color')) {
        await queryRunner.query(`ALTER TABLE \`${tableName}\` DROP COLUMN \`color\`;`);
      }
    }
  }
}
