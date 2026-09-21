import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLAN_NOTIFICATION_SYSTEM.md - Phase 1: tạo 3 bảng của hệ thống thông báo.
 *
 *  1. notification_broadcasts  - 1 dòng / 1 lần gửi THỦ CÔNG (tạo TRƯỚC vì
 *                                notifications có FK trỏ vào).
 *  2. notifications           - hộp thư, mỗi người nhận 1 dòng (tự động + thủ công).
 *  3. notification_preferences - tuỳ chọn cá nhân (opt-out).
 *
 * Tạo sẵn `broadcast_id` / `dismissed_at` / `is_read` ngay từ đầu để Phase M1
 * (thông báo thủ công) KHÔNG phải viết migration sửa bảng.
 *
 * `read_at` là nguồn sự thật của trạng thái đọc; `is_read` là cột TINYINT ghi được
 * (KHÔNG dùng cột sinh: TypeORM 0.3 + MySQL làm hỏng `migration:generate` cả dự án -
 * xem JSDoc `notification.entity.ts`). Mọi cột thời gian là DATETIME(3), không dùng
 * TIMESTAMP (tránh MySQL tự quy đổi theo session timezone).
 *
 * KHÔNG seed permission ở đây: inbox cá nhân chỉ cần JwtAuthGuard; permission
 * `notification_broadcasts.send/view` sẽ seed bằng migration riêng ở Phase M1.
 */
export class CreateNotifications1783300000000 implements MigrationInterface {
  name = 'CreateNotifications1783300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notification_broadcasts (
        id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
        sender_id        INT NULL,
        title            VARCHAR(200) NOT NULL,
        body             TEXT NOT NULL,
        audience_type    VARCHAR(20) NOT NULL,
        audience_params  JSON NULL,
        entity_type      VARCHAR(30) NULL,
        entity_id        INT NULL,
        recipient_count  INT NOT NULL DEFAULT 0,
        created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_sender_created (sender_id, created_at),
        KEY idx_created (created_at),
        CONSTRAINT fk_broadcast_sender FOREIGN KEY (sender_id)
          REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
        recipient_id     INT NOT NULL,
        actor_id         INT NULL,
        event_type       VARCHAR(60) NOT NULL,
        category         VARCHAR(20) NOT NULL,
        relation         VARCHAR(40) NOT NULL,
        entity_type      VARCHAR(30) NULL,
        entity_id        INT NULL,
        sub_entity_type  VARCHAR(30) NULL,
        sub_entity_id    INT NULL,
        broadcast_id     INT UNSIGNED NULL,
        title            VARCHAR(200) NOT NULL,
        body             VARCHAR(500) NULL,
        params           JSON NULL,
        occurrences      INT NOT NULL DEFAULT 1,
        coalesce_key     VARCHAR(120) NULL,
        dedupe_key       VARCHAR(120) NULL,
        read_at          DATETIME(3) NULL,
        is_read          TINYINT(1) NOT NULL DEFAULT 0,
        dismissed_at     DATETIME(3) NULL,
        created_at       DATETIME(3) NOT NULL,
        sort_at          DATETIME(3) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uk_recipient_coalesce (recipient_id, coalesce_key),
        UNIQUE KEY uk_recipient_dedupe (recipient_id, dedupe_key),
        KEY idx_recipient_unread (recipient_id, read_at),
        KEY idx_recipient_sort (recipient_id, sort_at, id),
        KEY idx_entity (entity_type, entity_id),
        KEY idx_broadcast_read (broadcast_id, read_at),
        CONSTRAINT fk_notif_recipient FOREIGN KEY (recipient_id)
          REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_notif_actor FOREIGN KEY (actor_id)
          REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT fk_notif_broadcast FOREIGN KEY (broadcast_id)
          REFERENCES notification_broadcasts(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_id     INT NOT NULL,
        event_type  VARCHAR(60) NOT NULL,
        enabled     TINYINT(1) NOT NULL,
        updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (user_id, event_type),
        CONSTRAINT fk_notifpref_user FOREIGN KEY (user_id)
          REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Thứ tự ngược: bảng con (có FK) trước, bảng cha sau.
    await queryRunner.query(`DROP TABLE IF EXISTS notification_preferences`);
    await queryRunner.query(`DROP TABLE IF EXISTS notifications`);
    await queryRunner.query(`DROP TABLE IF EXISTS notification_broadcasts`);
  }
}
