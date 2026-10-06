import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dọn dữ liệu do bug cron `auto-overdue`: Task đã "Hoàn thành" (status.is_done_state = 1, code `completed`)
 * bị hệ thống đánh dấu quá hạn / khoá tự động nhầm (cron chỉ loại code in_review/done).
 *
 * CHỈ đụng dòng do HỆ THỐNG đặt (`overdue_marked_by_id IS NULL`, `locked_by_id IS NULL` + lock_note tự động);
 * dấu/khoá do người dùng đặt tay được giữ nguyên. Sao lưu trạng thái cũ vào bảng
 * `periodic_tasks_autoflag_fix_bak` để `down()` khôi phục. Giữ nguyên `updated_at` (không làm lệch "Sửa cuối").
 */
export class FixAutoOverdueOnCompletedTasks1786100000000 implements MigrationInterface {
  name = 'FixAutoOverdueOnCompletedTasks1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS periodic_tasks_autoflag_fix_bak (
        task_id INT NOT NULL PRIMARY KEY,
        overdue_marked_at DATETIME NULL,
        overdue_marked_by_id INT NULL,
        is_locked TINYINT NOT NULL DEFAULT 0,
        locked_by_id INT NULL,
        locked_at DATETIME NULL,
        lock_note VARCHAR(500) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      INSERT IGNORE INTO periodic_tasks_autoflag_fix_bak
        (task_id, overdue_marked_at, overdue_marked_by_id, is_locked, locked_by_id, locked_at, lock_note)
      SELECT t.id, t.overdue_marked_at, t.overdue_marked_by_id, t.is_locked, t.locked_by_id, t.locked_at, t.lock_note
      FROM periodic_tasks t
      JOIN periodic_task_statuses s ON s.id = t.status_id
      WHERE s.is_done_state = 1
        AND (
          (t.overdue_marked_at IS NOT NULL AND t.overdue_marked_by_id IS NULL)
          OR (t.is_locked = 1 AND t.locked_by_id IS NULL AND t.lock_note LIKE 'Tự động khoá%')
        );
    `);

    await queryRunner.query(`
      UPDATE periodic_tasks t
      JOIN periodic_task_statuses s ON s.id = t.status_id
      SET t.overdue_marked_at = NULL, t.updated_at = t.updated_at
      WHERE s.is_done_state = 1 AND t.overdue_marked_at IS NOT NULL AND t.overdue_marked_by_id IS NULL;
    `);

    await queryRunner.query(`
      UPDATE periodic_tasks t
      JOIN periodic_task_statuses s ON s.id = t.status_id
      SET t.is_locked = 0, t.locked_at = NULL, t.locked_by_id = NULL, t.lock_note = NULL, t.updated_at = t.updated_at
      WHERE s.is_done_state = 1 AND t.is_locked = 1 AND t.locked_by_id IS NULL AND t.lock_note LIKE 'Tự động khoá%';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE periodic_tasks t
      JOIN periodic_tasks_autoflag_fix_bak b ON b.task_id = t.id
      SET t.overdue_marked_at = b.overdue_marked_at, t.overdue_marked_by_id = b.overdue_marked_by_id,
          t.is_locked = b.is_locked, t.locked_by_id = b.locked_by_id, t.locked_at = b.locked_at,
          t.lock_note = b.lock_note, t.updated_at = t.updated_at;
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS periodic_tasks_autoflag_fix_bak;`);
  }
}
