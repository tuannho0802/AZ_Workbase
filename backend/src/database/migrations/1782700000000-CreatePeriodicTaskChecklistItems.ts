import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 6 (1/1) của module "Công việc định kỳ" - xem
 * `AZ-Workbase Skills/PLAN_PERIODIC_TASKS_MODULE.md` mục 3 (schema) + mục 6
 * (Phase 6 - Checklist con kiểu Trello, TÁCH RIÊNG, làm SAU CÙNG).
 *
 * Tạo bảng `periodic_task_checklist_items` - item phẳng kiểu Trello (KHÔNG
 * có vòng đời/không recurring riêng, khác `periodic_tasks`). KHÔNG seed
 * permission mới - CRUD checklist thừa hưởng `periodic_tasks.edit` của
 * chính Task cha (đã chốt ở PLAN mục 6 Phase 6), xem
 * `PeriodicTaskChecklistItemsService`/`PeriodicTasksController`.
 *
 * `position` dùng để hỗ trợ reorder (kéo-thả) - item mới luôn thêm vào cuối
 * (MAX(position)+1 trong phạm vi 1 Task), soft-reset lại liên tục 0..n-1 mỗi
 * lần `reorder()` để tránh trôi dần theo thời gian (xem Service).
 */
export class CreatePeriodicTaskChecklistItems1782700000000 implements MigrationInterface {
  name = 'CreatePeriodicTaskChecklistItems1782700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS periodic_task_checklist_items (
        id INT PRIMARY KEY AUTO_INCREMENT,
        task_id INT NOT NULL,
        content VARCHAR(500) NOT NULL,
        is_done BOOLEAN NOT NULL DEFAULT FALSE,
        position INT NOT NULL DEFAULT 0,
        created_by_id INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        INDEX idx_periodic_task_checklist_items_task (task_id),
        INDEX idx_periodic_task_checklist_items_task_position (task_id, position),

        CONSTRAINT fk_periodic_task_checklist_items_task
          FOREIGN KEY (task_id) REFERENCES periodic_tasks(id) ON DELETE CASCADE,
        CONSTRAINT fk_periodic_task_checklist_items_created_by
          FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS periodic_task_checklist_items`);
  }
}
