import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 (2/3) của module "Công việc định kỳ" - xem
 * `AZ-Workbase Skills/PLAN_PERIODIC_TASKS_MODULE.md` mục 3 (schema) + mục 6
 * (Phase 1) + mục 7 (danh sách migration dự kiến).
 *
 * Tạo bảng thực thể chính `periodic_tasks` - 1 dòng = 1 công việc CỤ THỂ do
 * User tự tay tạo (KHÔNG có Template/recurrence engine, xem PLAN mục 1.1 +
 * 2.1). Migration NÀY CHƯA có: cột lock (`is_locked`... - Phase 5, migration
 * `AddPeriodicTaskLockColumns`), bảng `periodic_task_links` (Phase 2),
 * `periodic_task_customers` (Phase 3), `periodic_task_secondary_assignees`
 * (Phase 4) - cố tình để giữ Phase 1 nhỏ, dễ review (đúng mục 6 của PLAN).
 */
export class CreatePeriodicTasks1782000000000 implements MigrationInterface {
  name = 'CreatePeriodicTasks1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS periodic_tasks (
        id INT PRIMARY KEY AUTO_INCREMENT,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        period_type ENUM('daily', 'weekly', 'monthly', 'yearly') NOT NULL,
        period_start_date DATE NOT NULL,
        period_end_date DATE NOT NULL,
        status_id INT NOT NULL,
        primary_assignee_id INT NOT NULL,
        department_id INT NULL,
        created_by_id INT NOT NULL,
        updated_by_id INT NULL,
        completed_at DATETIME NULL,
        note TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,

        INDEX idx_periodic_tasks_period_type (period_type),
        INDEX idx_periodic_tasks_status (status_id),
        INDEX idx_periodic_tasks_primary_assignee (primary_assignee_id),
        INDEX idx_periodic_tasks_department (department_id),
        INDEX idx_periodic_tasks_period_start_date (period_start_date),
        INDEX idx_periodic_tasks_deleted_at (deleted_at),

        CONSTRAINT fk_periodic_tasks_status
          FOREIGN KEY (status_id) REFERENCES periodic_task_statuses(id) ON DELETE RESTRICT,
        CONSTRAINT fk_periodic_tasks_primary_assignee
          FOREIGN KEY (primary_assignee_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_periodic_tasks_department
          FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
        CONSTRAINT fk_periodic_tasks_created_by
          FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_periodic_tasks_updated_by
          FOREIGN KEY (updated_by_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS periodic_tasks`);
  }
}
