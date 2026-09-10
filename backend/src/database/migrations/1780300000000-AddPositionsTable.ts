import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1/4 của PLAN_POSITION_FIELD_VISIBILITY_ASSIGNMENT_GROUPS.md - thêm
 * khái niệm "Position" (Vị trí), đặt DƯỚI Role (vd Role `employee` + Position
 * `content`/`editor`/`media`, hoặc Role `admin` + Position `hr`/`it`/`director`/`ceo`).
 *
 * ⚠️ `positions.department_id` CHỈ mang tính TỔ CHỨC/GỢI Ý (nhóm Position
 * theo phòng ban cho dễ nhìn trong UI quản lý) - KHÔNG ràng buộc "user thuộc
 * phòng ban A chỉ được chọn Position có department_id = A". Xem giải thích
 * đầy đủ trong `database/entities/position.entity.ts`.
 *
 * `users.position_id` LUÔN nullable - rất nhiều user hiện có sẽ NULL ngay
 * sau migration này, hệ thống PHẢI hoạt động y hệt hôm nay với NULL (coi như
 * không có override Position, fallback về Department/Global) - KHÔNG được
 * phá hành vi đang chạy cho các tài khoản khác đang dùng chung repo.
 *
 * Seed kèm permission mới `positions.manage` (Admin/Assistant = all, giống
 * đúng pattern `departments.manage`) để `PositionsController` có quyền để
 * enforce ngay khi module được thêm ở cùng lượt code này.
 */
export class AddPositionsTable1780300000000 implements MigrationInterface {
  name = 'AddPositionsTable1780300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS positions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        code VARCHAR(50) NOT NULL,
        name VARCHAR(100) NOT NULL,
        department_id INT NULL,
        description VARCHAR(255) NULL,
        is_system BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_positions_code (code),
        CONSTRAINT fk_positions_department FOREIGN KEY (department_id)
          REFERENCES departments(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS position_id INT NULL;
    `);

    // MySQL không hỗ trợ "ADD CONSTRAINT IF NOT EXISTS" - kiểm tra tồn tại
    // trước qua information_schema để migration idempotent, tránh lỗi
    // "Duplicate key name" nếu chạy lại trên môi trường đã có FK này.
    const [{ cnt }] = await queryRunner.query(`
      SELECT COUNT(*) as cnt FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND CONSTRAINT_NAME = 'fk_users_position'
    `);
    if (Number(cnt) === 0) {
      await queryRunner.query(`
        ALTER TABLE users
          ADD CONSTRAINT fk_users_position FOREIGN KEY (position_id)
            REFERENCES positions(id) ON DELETE SET NULL;
      `);
    }

    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('positions.manage', 'positions', 'manage', FALSE, 'CRUD Vị trí (Position) - bảng cấu hình toàn cục, không theo phòng ban')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL
      FROM roles r, permissions p
      WHERE p.key = 'positions.manage'
        AND r.code IN ('admin', 'assistant');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE rp FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.key = 'positions.manage';
    `);
    await queryRunner.query(`DELETE FROM permissions WHERE \`key\` = 'positions.manage'`);

    const [{ cnt }] = await queryRunner.query(`
      SELECT COUNT(*) as cnt FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND CONSTRAINT_NAME = 'fk_users_position'
    `);
    if (Number(cnt) > 0) {
      await queryRunner.query(`ALTER TABLE users DROP FOREIGN KEY fk_users_position`);
    }
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS position_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS positions`);
  }
}
