import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 (bổ sung theo yêu cầu chủ dự án) - thêm cột `color` cho
 * `periodic_tasks`. Dùng CHỈ để hiển thị UI (Card/Kanban/Calendar...) sau
 * này, KHÔNG mang ý nghĩa nghiệp vụ, không ảnh hưởng RBAC/scope.
 *
 * Lưu dạng hex 6 ký tự bao gồm dấu '#' (vd '#FF5733') -> VARCHAR(7), nullable
 * (Task cũ/không set màu vẫn hợp lệ, FE tự quyết định màu mặc định khi hiển
 * thị nếu NULL).
 */
export class AddColorToPeriodicTasks1782200000000 implements MigrationInterface {
  name = 'AddColorToPeriodicTasks1782200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE periodic_tasks
      ADD COLUMN IF NOT EXISTS color VARCHAR(7) NULL
      COMMENT 'Màu Task (hex, vd #FF5733) - chỉ dùng hiển thị UI'
      AFTER status_id;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE periodic_tasks DROP COLUMN IF EXISTS color;
    `);
  }
}
