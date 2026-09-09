import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trang Admin `/storage-img` - dashboard quản lý dung lượng B2 + thư viện
 * ảnh chung (media-library). Xem thiết kế đầy đủ trong hội thoại research
 * ngày 2026-09-08 (không có file plan riêng, quyết định qua chat).
 *
 * - `storage_soft_limit_gb`: B2 KHÔNG có quota cứng (unlimited, trả tiền
 *   theo dung lượng thật). "Còn lại bao nhiêu" là hạn mức MỀM do Admin tự
 *   đặt để theo dõi, KHÔNG phải giới hạn kỹ thuật thật của B2 - dùng để
 *   tính % thanh progress bar trên UI, KHÔNG chặn upload nếu vượt.
 *
 * - `storage.view`: xem trang, xem dung lượng đã dùng, xem danh sách media
 *   (cả 3 bucket: avatars, leave-attachments, media-library).
 * - `storage.manage`: xoá/upload vào bucket `media-library` (2 bucket cũ
 *   LUÔN view-only qua trang này dù có storage.manage - vì object key của
 *   2 bucket đó được tham chiếu trong `users.avatar_url` /
 *   `leave_request_attachments.object_key`, xoá trực tiếp sẽ để lại DB
 *   trỏ tới file đã mất).
 *
 * Tách 2 permission riêng (thay vì gộp 1) theo đúng convention Dynamic RBAC
 * hiện tại (vd `customers.view` vs `customers.manage`) - để sau này có thể
 * cho 1 role xem mà không cho xoá/thêm.
 */
export class AddStorageManagementPermissions1780100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Bảng settings đã được migration 1780000000000 đảm bảo tồn tại
    // (CREATE TABLE IF NOT EXISTS) - không cần tạo lại ở đây.
    await queryRunner.query(`
      INSERT INTO settings (\`key\`, value, description) VALUES
      ('storage_soft_limit_gb', '50', 'Hạn mức MỀM (GB) để theo dõi trên UI - B2 không có quota cứng, KHÔNG chặn upload nếu vượt')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('storage.view', 'storage', 'view', FALSE, 'Xem trang quản lý dung lượng B2 + danh sách media (avatars/leave-attachments/media-library)'),
      ('storage.manage', 'storage', 'manage', FALSE, 'Xoá/thêm media trong bucket media-library (2 bucket avatars/leave-attachments LUÔN view-only)')
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL
      FROM roles r, permissions p
      WHERE p.key IN ('storage.view', 'storage.manage')
        AND r.code = 'admin';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM permissions WHERE \`key\` IN ('storage.view', 'storage.manage')`);
    await queryRunner.query(`DELETE FROM settings WHERE \`key\` = 'storage_soft_limit_gb'`);
  }
}
