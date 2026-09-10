import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4 của PLAN_POSITION_FIELD_VISIBILITY_ASSIGNMENT_GROUPS.md - "Quản lý
 * phụ trách" (Assignment Group Config): thay thế hardcode FE
 * `.find((d) => d.name?.toLowerCase().includes('kinh doanh'))` ở
 * customers/page.tsx bằng bảng Admin tự cấu hình qua UI.
 *
 * 1 config = key bất biến (vd 'sales'/'marketing') + N Phòng ban (BẮT BUỘC
 * >=1) + N Vị trí (TUỲ CHỌN). Seed 2 config hệ thống `is_system=true` để giữ
 * NGUYÊN hành vi hardcode hiện tại (tự dò phòng ban theo tên chứa "kinh
 * doanh"/"marketing", không phân biệt hoa/thường) - KHÔNG phá UX đang chạy.
 * Nếu môi trường không có phòng ban khớp tên (vd DB test trống), config vẫn
 * được tạo nhưng để trống danh sách phòng ban - Admin tự vào UI thêm sau,
 * KHÔNG throw lỗi migration.
 *
 * ⚠️ Đây MỚI CHỈ tạo bảng + seed data - CHƯA đổi `customers/page.tsx` sang
 * dùng API mới (giữ nguyên hardcode cũ cho tới khi có quyết định chuyển đổi
 * riêng, đúng yêu cầu "chưa remove vội" của chủ dự án).
 *
 * ⚠️ SỬA (2026-09-10, cùng ngày, TRƯỚC khi chạy trên bất kỳ môi trường nào -
 * migration này CHƯA từng apply nên sửa trực tiếp là an toàn, đúng
 * `SKILL_DATABASE_MANAGEMENT.md` mục 5): thêm config thứ 3 `content_staff`
 * ("Nhân viên Content") = Phòng Marketing + Vị trí có `code='content'`
 * (đã seed sẵn ở migration `1780800000000-SeedSamplePositions.ts`, chạy
 * TRƯỚC migration này nên bảng `positions` đã có dòng `content` khi tới
 * đây). Dùng để thay thế bộ lọc client-side cứng `position.code === 'content'`
 * ở `GroupManagersModal.tsx` (trang "Quản lý nhóm liên kết" > Quản lý
 * chính/phụ > Nhân viên Content) bằng 1 config có thể chỉnh qua UI, đồng bộ
 * đúng 1 cơ chế với dropdown Sales/Marketing phụ trách ở trang Khách hàng.
 */
export class CreateAssignmentGroupConfigs1781100000000 implements MigrationInterface {
  name = 'CreateAssignmentGroupConfigs1781100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS assignment_group_configs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        \`key\` VARCHAR(50) NOT NULL,
        name VARCHAR(100) NOT NULL,
        description VARCHAR(255) NULL,
        is_system BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_assignment_group_key (\`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS assignment_group_config_departments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        config_id INT NOT NULL,
        department_id INT NOT NULL,
        UNIQUE KEY uk_config_dept (config_id, department_id),
        CONSTRAINT fk_agcd_config FOREIGN KEY (config_id)
          REFERENCES assignment_group_configs(id) ON DELETE CASCADE,
        CONSTRAINT fk_agcd_department FOREIGN KEY (department_id)
          REFERENCES departments(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS assignment_group_config_positions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        config_id INT NOT NULL,
        position_id INT NOT NULL,
        UNIQUE KEY uk_config_pos (config_id, position_id),
        CONSTRAINT fk_agcp_config FOREIGN KEY (config_id)
          REFERENCES assignment_group_configs(id) ON DELETE CASCADE,
        CONSTRAINT fk_agcp_position FOREIGN KEY (position_id)
          REFERENCES positions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Seed 3 config hệ thống - idempotent qua ON DUPLICATE KEY UPDATE.
    await queryRunner.query(`
      INSERT INTO assignment_group_configs (\`key\`, name, description, is_system) VALUES
      ('sales', 'Sales phụ trách', 'Danh sách nhân sự hợp lệ cho dropdown "Sales phụ trách"', TRUE),
      ('marketing', 'Marketing phụ trách', 'Danh sách nhân sự hợp lệ cho dropdown "Marketing phụ trách"', TRUE),
      ('content_staff', 'Nhân viên Content', 'Danh sách nhân sự hợp lệ để thêm làm "Nhân viên Content" ở trang Quản lý nhóm liên kết', TRUE)
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    // Auto-map phòng ban theo TÊN (giữ đúng logic hardcode cũ ở
    // customers/page.tsx) - không hardcode department_id vì id khác nhau
    // giữa các môi trường dùng chung migration này.
    await queryRunner.query(`
      INSERT IGNORE INTO assignment_group_config_departments (config_id, department_id)
      SELECT c.id, d.id
      FROM assignment_group_configs c
      JOIN departments d ON LOWER(d.name) LIKE '%kinh doanh%'
      WHERE c.key = 'sales';
    `);
    await queryRunner.query(`
      INSERT IGNORE INTO assignment_group_config_departments (config_id, department_id)
      SELECT c.id, d.id
      FROM assignment_group_configs c
      JOIN departments d ON LOWER(d.name) LIKE '%marketing%'
      WHERE c.key = 'marketing';
    `);
    // "Nhân viên Content" mặc định = Phòng Marketing (giữ đúng yêu cầu
    // "mặc định là nhân viên phòng marketing vị trí nhân viên content").
    await queryRunner.query(`
      INSERT IGNORE INTO assignment_group_config_departments (config_id, department_id)
      SELECT c.id, d.id
      FROM assignment_group_configs c
      JOIN departments d ON LOWER(d.name) LIKE '%marketing%'
      WHERE c.key = 'content_staff';
    `);
    // + Vị trí `code='content'` (TUỲ CHỌN về mặt cơ chế, nhưng seed sẵn theo
    // đúng yêu cầu nghiệp vụ "vị trí nhân viên content").
    await queryRunner.query(`
      INSERT IGNORE INTO assignment_group_config_positions (config_id, position_id)
      SELECT c.id, p.id
      FROM assignment_group_configs c
      JOIN positions p ON p.code = 'content'
      WHERE c.key = 'content_staff';
    `);

    // Permission mới - CRUD "Quản lý phụ trách" (Admin/Assistant, giống
    // đúng pattern positions.manage).
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('assignment_groups.manage', 'assignment_groups', 'manage', FALSE, 'CRUD "Quản lý phụ trách" (Assignment Group Config) - bảng cấu hình toàn cục')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL
      FROM roles r, permissions p
      WHERE p.key = 'assignment_groups.manage'
        AND r.code IN ('admin', 'assistant');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE rp FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.key = 'assignment_groups.manage';
    `);
    await queryRunner.query(`DELETE FROM permissions WHERE \`key\` = 'assignment_groups.manage'`);

    await queryRunner.query(`DROP TABLE IF EXISTS assignment_group_config_positions`);
    await queryRunner.query(`DROP TABLE IF EXISTS assignment_group_config_departments`);
    await queryRunner.query(`DROP TABLE IF EXISTS assignment_group_configs`);
  }
}