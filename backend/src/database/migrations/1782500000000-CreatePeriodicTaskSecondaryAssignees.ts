import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4 (1/1) của module "Công việc định kỳ" - xem
 * `AZ-Workbase Skills/PLAN_PERIODIC_TASKS_MODULE.md` mục 2.5, 3 (schema) +
 * mục 6 (Phase 4).
 *
 * Tạo bảng join thuần `periodic_task_secondary_assignees` ("phụ trách phụ"
 * của 1 Task, mirror `link_group_secondary_managers` - add/remove, KHÔNG
 * giữ lịch sử). "Chính" đã có sẵn từ Phase 1 (`periodic_tasks.
 * primary_assignee_id`, NOT NULL) - migration này KHÔNG đụng tới cột đó.
 *
 * `UNIQUE(task_id, user_id)` chặn trùng phụ trách phụ ở tầng DB (spec bắt
 * buộc PLAN mục 6: "unique constraint - không thêm trùng"). Ràng buộc "1
 * người không được vừa chính vừa phụ" KHÔNG thể biểu diễn bằng CHECK
 * constraint MySQL (phải so sánh chéo bảng khác) - validate ở
 * `PeriodicTaskSecondaryAssigneesService`.
 *
 * KHÔNG cần permission mới - `POST/DELETE .../secondary-assignees` dùng
 * chung `periodic_tasks.edit` đã seed từ Phase 1 (xem PLAN mục 4/5).
 */
export class CreatePeriodicTaskSecondaryAssignees1782500000000 implements MigrationInterface {
  name = 'CreatePeriodicTaskSecondaryAssignees1782500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS periodic_task_secondary_assignees (
        id INT PRIMARY KEY AUTO_INCREMENT,
        task_id INT NOT NULL,
        user_id INT NOT NULL,
        added_by_id INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        UNIQUE KEY uk_periodic_task_secondary_assignees_task_user (task_id, user_id),
        INDEX idx_periodic_task_secondary_assignees_task (task_id),
        INDEX idx_periodic_task_secondary_assignees_user (user_id),

        CONSTRAINT fk_periodic_task_secondary_assignees_task
          FOREIGN KEY (task_id) REFERENCES periodic_tasks(id) ON DELETE CASCADE,
        CONSTRAINT fk_periodic_task_secondary_assignees_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_periodic_task_secondary_assignees_added_by
          FOREIGN KEY (added_by_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS periodic_task_secondary_assignees`);
  }
}
