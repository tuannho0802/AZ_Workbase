import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 7 (CUỐI) của module "Công việc định kỳ" - xem
 * `AZ-Workbase Skills/PLAN_PERIODIC_TASKS_MODULE.md` mục 2.6 (thiết kế) +
 * mục 3 (schema) + mục 6 (Phase 7 - Audit log riêng, hoàn thiện toàn module).
 *
 * Tạo bảng `periodic_task_audit_logs` - mirror `audit_logs` chung nhưng có
 * FK `task_id` trực tiếp (thay vì `entity_type`/`entity_id` rời rạc), cho
 * phép join thẳng khi debug lịch sử 1 Task. KHÔNG seed permission mới - dùng
 * lại `periodic_tasks.view` cho endpoint `GET /:id/audit-logs` (đã chốt PLAN
 * mục 5).
 */
export class CreatePeriodicTaskAuditLogs1782800000000 implements MigrationInterface {
  name = 'CreatePeriodicTaskAuditLogs1782800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS periodic_task_audit_logs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        task_id INT NOT NULL,
        user_id INT NOT NULL,
        action VARCHAR(50) NOT NULL,
        old_data JSON NULL,
        new_data JSON NULL,
        ip_address VARCHAR(45) NULL,
        user_agent TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        INDEX idx_periodic_task_audit_logs_task (task_id),
        INDEX idx_periodic_task_audit_logs_created_at (created_at),

        CONSTRAINT fk_periodic_task_audit_logs_task
          FOREIGN KEY (task_id) REFERENCES periodic_tasks(id) ON DELETE CASCADE,
        CONSTRAINT fk_periodic_task_audit_logs_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS periodic_task_audit_logs`);
  }
}
