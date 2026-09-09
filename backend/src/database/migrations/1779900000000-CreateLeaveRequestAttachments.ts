import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Theo `AZ-Workbase Skills/PLAN_AVATAR_LEAVE_ATTACHMENT_BACKBLAZE_B2.md`: yêu
 * cầu chủ dự án cập nhật (chat 2026-09-09) là 1 đơn nghỉ phép có thể đính
 * kèm TỐI ĐA NHIỀU ảnh (mặc định 5, cấu hình động qua bảng `settings` -
 * xem migration `1780000000000-AddUploadSettingsAndPermission`), trong khi
 * `leave_requests.attachment_url` hiện có chỉ là 1 cột VARCHAR đơn giá trị -
 * KHÔNG đủ. Giải pháp: bảng con 1-N mới, KHÔNG xoá cột cũ (tránh vỡ dữ liệu
 * cũ nếu đã có đơn nào từng dùng field này qua Swagger/test thủ công).
 *
 * `object_key`: lưu OBJECT KEY trên Backblaze B2 (bucket
 * `az-imgs-leave-request-workbase`, Private), KHÔNG phải URL - giống hệt
 * bản chất `users.avatar_url`. Phải ký lại Presigned GET on-demand qua
 * `LeaveRequestsService.getAttachmentViewUrls()`.
 */
export class CreateLeaveRequestAttachments1779900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS leave_request_attachments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        leave_request_id INT NOT NULL,
        object_key VARCHAR(500) NOT NULL COMMENT 'Object key trên B2 (bucket leave-attachments), không phải URL',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        INDEX idx_leave_request (leave_request_id),

        FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS leave_request_attachments;`);
  }
}
