import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2 (1/1) của module "Công việc định kỳ" - xem
 * `AZ-Workbase Skills/PLAN_PERIODIC_TASKS_MODULE.md` mục 3 (schema) + mục 6
 * (Phase 2).
 *
 * Tạo bảng cạnh `periodic_task_links` (DAG multi-parent + skip-level) -
 * `UNIQUE(child_task_id, parent_task_id)` chặn trùng cạnh ở tầng DB, rank +
 * chống chu trình được validate ở `PeriodicTaskLinksService` (không thể biểu
 * diễn bằng CHECK constraint MySQL cho quan hệ đệ quy).
 *
 * KHÔNG cần permission mới - `POST/DELETE .../links` dùng chung
 * `periodic_tasks.edit` đã seed từ Phase 1 (xem PLAN mục 4/5).
 */
export class CreatePeriodicTaskLinks1782300000000 implements MigrationInterface {
  name = 'CreatePeriodicTaskLinks1782300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS periodic_task_links (
        id INT PRIMARY KEY AUTO_INCREMENT,
        child_task_id INT NOT NULL,
        parent_task_id INT NOT NULL,
        created_by_id INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        UNIQUE KEY uk_periodic_task_links_child_parent (child_task_id, parent_task_id),
        INDEX idx_periodic_task_links_child (child_task_id),
        INDEX idx_periodic_task_links_parent (parent_task_id),

        CONSTRAINT fk_periodic_task_links_child
          FOREIGN KEY (child_task_id) REFERENCES periodic_tasks(id) ON DELETE CASCADE,
        CONSTRAINT fk_periodic_task_links_parent
          FOREIGN KEY (parent_task_id) REFERENCES periodic_tasks(id) ON DELETE CASCADE,
        CONSTRAINT fk_periodic_task_links_created_by
          FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS periodic_task_links`);
  }
}
