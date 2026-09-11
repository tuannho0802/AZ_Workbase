import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ⚠️ BỐI CẢNH (yêu cầu chủ dự án, 2026-09-11, ngay sau khi mở endpoint gán
 * `managerUserId` ở migration/commit trước): 1 phòng ban cần cho phép NHIỀU
 * Manager cùng quản lý, hoặc NHIỀU Assistant cùng được giới hạn hỗ trợ 1
 * phòng ban - cột đơn `departments.manager_user_id` (1-1) không đáp ứng
 * được. Thêm bảng nối nhiều-nhiều `department_managers`.
 *
 * Dữ liệu cũ ở `departments.manager_user_id` được MIGRATE 1 LẦN sang bảng
 * mới (không mất dữ liệu đã gán trước đó) - cột cũ VẪN GIỮ NGUYÊN trong DB
 * (không drop, đúng SKILL_FILE_MANAGEMENT.md mục 3.1) nhưng từ migration này
 * trở đi KHÔNG còn code nào đọc/ghi cột đó nữa (xem department-manager.entity.ts).
 *
 * FK `user_id` KHÔNG dùng ON DELETE CASCADE (khác `department_id`) - xem
 * giải thích đầy đủ trong department-manager.entity.ts + fallback thủ công
 * đã thêm trong `UsersService.hardDeleteUser()`.
 */
export class CreateDepartmentManagers1781800000000 implements MigrationInterface {
  name = 'CreateDepartmentManagers1781800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS department_managers (
        id INT PRIMARY KEY AUTO_INCREMENT,
        department_id INT NOT NULL,
        user_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_department_manager (department_id, user_id),
        INDEX idx_dept_managers_department (department_id),
        INDEX idx_dept_managers_user (user_id),
        CONSTRAINT fk_dept_managers_department FOREIGN KEY (department_id)
          REFERENCES departments(id) ON DELETE CASCADE,
        CONSTRAINT fk_dept_managers_user FOREIGN KEY (user_id)
          REFERENCES users(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Migrate dữ liệu 1-1 cũ sang bảng nhiều-nhiều mới - idempotent qua
    // INSERT IGNORE (an toàn nếu migration này lỡ chạy lại).
    await queryRunner.query(`
      INSERT IGNORE INTO department_managers (department_id, user_id)
      SELECT id, manager_user_id FROM departments WHERE manager_user_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS department_managers`);
  }
}
