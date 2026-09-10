import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Data-seed migration (KHÔNG đổi schema) - nạp sẵn vài dòng `positions` mẫu
 * đúng các ví dụ đã thống nhất trong PLAN_POSITION_FIELD_VISIBILITY_ASSIGNMENT_GROUPS.md
 * mục 1 (Admin/HR, Admin/IT, Admin/Director, Admin/CEO, Employee/Content,
 * Employee/Editor, Employee/Media), để có dữ liệu mẫu ngay sau khi chạy
 * migration thay vì phải tự tạo tay qua UI `/vi-tri` trước khi test các
 * phần phụ thuộc Position (override phân quyền, UI Visibility, sau này là
 * Assignment Group).
 *
 * ⚠️ `department_id` CHỈ mang tính TỔ CHỨC/GỢI Ý (xem JSDoc `position.entity.ts`)
 * - tra theo TÊN phòng ban (không hardcode id, vì id phòng ban khác nhau
 * giữa các môi trường/instance khác nhau đang chạy chung migration này).
 * Nếu môi trường nào không có phòng ban tên khớp, `department_id` rơi về
 * NULL - KHÔNG lỗi migration, vẫn đúng thiết kế "optional".
 *
 * `is_system = FALSE` cho TẤT CẢ dòng seed này (đây là DATA MẪU, không phải
 * Position lõi hệ thống nào bị code hardcode phụ thuộc - xem `PositionsService`,
 * không có chỗ nào so sánh cứng theo `code` Position) - Admin được xoá/sửa
 * thoải mái qua UI nếu không phù hợp thực tế công ty.
 *
 * Idempotent: `code` có UNIQUE KEY (`uk_positions_code`) - dùng
 * `ON DUPLICATE KEY UPDATE code = code` (no-op) để chạy lại an toàn, không
 * tạo trùng nếu 1 tài khoản khác đã seed tay trước đó.
 */
export class SeedSamplePositions1780800000000 implements MigrationInterface {
  name = 'SeedSamplePositions1780800000000';

  private readonly seedCodes = ['ceo', 'hr', 'it', 'director', 'content', 'editor', 'media'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // CEO - vị trí cao nhất, không gắn 1 phòng ban cụ thể (đúng ví dụ "Admin
    // lớn nhất là CEO" trong PLAN - không phải Admin của riêng phòng nào).
    await queryRunner.query(`
      INSERT INTO positions (code, name, department_id, description, is_system)
      VALUES ('ceo', 'CEO', NULL, 'Vị trí quản lý cao nhất, không giới hạn theo phòng ban cụ thể', FALSE)
      ON DUPLICATE KEY UPDATE code = code;
    `);

    // HR - ví dụ "Admin phòng vận hành sẽ là HR" -> gợi ý phòng Operations.
    await queryRunner.query(`
      INSERT INTO positions (code, name, department_id, description, is_system)
      SELECT 'hr', 'HR', d.id, 'Admin phụ trách nhân sự/vận hành', FALSE
      FROM departments d WHERE d.name = 'Operations' LIMIT 1
      ON DUPLICATE KEY UPDATE code = code;
    `);
    // Fallback nếu môi trường không có phòng ban tên "Operations" - vẫn tạo
    // dòng HR với department_id NULL để không mất dữ liệu mẫu (optional field).
    await queryRunner.query(`
      INSERT INTO positions (code, name, department_id, description, is_system)
      SELECT 'hr', 'HR', NULL, 'Admin phụ trách nhân sự/vận hành', FALSE
      WHERE NOT EXISTS (SELECT 1 FROM positions WHERE code = 'hr')
      ON DUPLICATE KEY UPDATE code = code;
    `);

    // IT - ví dụ "Admin phòng hỗ trợ kỹ thuật sẽ là IT" -> gợi ý phòng IT.
    await queryRunner.query(`
      INSERT INTO positions (code, name, department_id, description, is_system)
      SELECT 'it', 'IT', d.id, 'Admin phụ trách hỗ trợ kỹ thuật', FALSE
      FROM departments d WHERE d.name = 'IT' LIMIT 1
      ON DUPLICATE KEY UPDATE code = code;
    `);
    await queryRunner.query(`
      INSERT INTO positions (code, name, department_id, description, is_system)
      SELECT 'it', 'IT', NULL, 'Admin phụ trách hỗ trợ kỹ thuật', FALSE
      WHERE NOT EXISTS (SELECT 1 FROM positions WHERE code = 'it')
      ON DUPLICATE KEY UPDATE code = code;
    `);

    // Director - ví dụ "Admin phòng Marketing sẽ là director" -> gợi ý phòng Marketing.
    await queryRunner.query(`
      INSERT INTO positions (code, name, department_id, description, is_system)
      SELECT 'director', 'Director', d.id, 'Admin phụ trách phòng Marketing', FALSE
      FROM departments d WHERE d.name = 'Marketing' LIMIT 1
      ON DUPLICATE KEY UPDATE code = code;
    `);
    await queryRunner.query(`
      INSERT INTO positions (code, name, department_id, description, is_system)
      SELECT 'director', 'Director', NULL, 'Admin phụ trách phòng Marketing', FALSE
      WHERE NOT EXISTS (SELECT 1 FROM positions WHERE code = 'director')
      ON DUPLICATE KEY UPDATE code = code;
    `);

    // Content / Editor / Media - ví dụ Employee thuộc phòng Marketing (dùng
    // để test UI Visibility Phase 3: Content KHÔNG thấy Sales/Marketing phụ trách).
    for (const [code, name] of [
      ['content', 'Content'],
      ['editor', 'Editor'],
      ['media', 'Media'],
    ]) {
      await queryRunner.query(`
        INSERT INTO positions (code, name, department_id, description, is_system)
        SELECT '${code}', '${name}', d.id, 'Nhân viên phòng Marketing', FALSE
        FROM departments d WHERE d.name = 'Marketing' LIMIT 1
        ON DUPLICATE KEY UPDATE code = code;
      `);
      await queryRunner.query(`
        INSERT INTO positions (code, name, department_id, description, is_system)
        SELECT '${code}', '${name}', NULL, 'Nhân viên phòng Marketing', FALSE
        WHERE NOT EXISTS (SELECT 1 FROM positions WHERE code = '${code}')
        ON DUPLICATE KEY UPDATE code = code;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Chỉ xoá ĐÚNG các dòng seed của migration này theo `code` - KHÔNG đụng
    // tới Position nào khác Admin đã tự tạo/sửa tên sau đó (nếu Admin đổi
    // `name` của dòng seed, `code` vẫn bất biến - xem JSDoc entity - nên
    // rollback theo `code` vẫn đúng dòng cần xoá).
    await queryRunner.query(
      `DELETE FROM positions WHERE code IN (${this.seedCodes.map((c) => `'${c}'`).join(', ')})`,
    );
  }
}
