import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * [M1 - CRUD đầy đủ cho Thông báo thủ công] Bổ sung 2 cột cho
 * `notification_broadcasts` (bảng đã tạo ở `1783300000000-CreateNotifications`)
 * để hỗ trợ Sửa/Xoá 1 lần gửi - xem `AZ-Workbase Skills/PLAN_NOTIFICATION_SYSTEM.md`
 * mục 6.7 (đã mở rộng so với bản v2 gốc: v2 chỉ định dismiss phía người nhận,
 * yêu cầu mới là XOÁ HẲN thông báo khỏi mọi hộp thư khi người gửi xoá lần gửi).
 *
 * - `updated_at` DATETIME(3) NULL: NULL = chưa từng sửa; có giá trị = thời
 *   điểm sửa gần nhất -> FE hiện nhãn "Đã chỉnh sửa lúc ...".
 * - `deleted_at` DATETIME(3) NULL: soft-delete cho bản ghi `notification_broadcasts`
 *   (giữ lịch sử/audit ai đã gửi gì, ai xoá) - KHÔNG áp dụng cho các dòng
 *   `notifications` fan-out của lần gửi này, các dòng đó bị XOÁ CỨNG bởi
 *   `NotificationBroadcastsService.remove()` (đúng yêu cầu "xoá thì mất thông
 *   báo luôn" ở mọi hộp thư người nhận - khác nguyên tắc 13 cũ trong PLAN,
 *   đã ghi chú lại trong PLAN + PERMISSIONS.md).
 */
export class AddEditDeleteToNotificationBroadcasts1783400000000
  implements MigrationInterface
{
  name = 'AddEditDeleteToNotificationBroadcasts1783400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE notification_broadcasts
        ADD COLUMN IF NOT EXISTS updated_at DATETIME(3) NULL AFTER created_at,
        ADD COLUMN IF NOT EXISTS deleted_at DATETIME(3) NULL AFTER updated_at
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE notification_broadcasts
        DROP COLUMN IF EXISTS deleted_at,
        DROP COLUMN IF EXISTS updated_at
    `);
  }
}
