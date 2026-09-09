import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cấu hình giới hạn upload ảnh (avatar + đính kèm nghỉ phép) - lưu động
 * trong bảng `settings` có sẵn (đúng pattern `audit_cleanup_enabled` /
 * `audit_retention_days` của `AuditService`), KHÔNG hard-code trong code,
 * để Admin/Assistant chỉnh qua UI mà không cần deploy lại.
 *
 * - `upload_avatar_max_size_kb`: dung lượng tối đa 1 ảnh avatar (SAU KHI
 *   client đã resize/nén, xem UploadsService validate khi confirm).
 * - `upload_leave_attachment_max_size_kb`: dung lượng tối đa MỖI ảnh đính
 *   kèm nghỉ phép.
 * - `upload_leave_attachment_max_count`: số ảnh tối đa / 1 đơn nghỉ phép.
 *
 * ⚠️ FIX (2026-09-08): Bảng `settings` được `AuditService` dùng từ trước
 * (`audit_cleanup_enabled`/`audit_retention_days`) nhưng CHƯA TỪNG có
 * migration nào tạo ra nó trong toàn bộ lịch sử `src/database/migrations/`
 * — chỉ tồn tại trên (các) DB nào từng bị tạo tay/qua `synchronize` ngoài
 * quy trình migration (vi phạm quy tắc "NGHIÊM CẤM sửa Schema bằng GUI").
 * Migration này giờ tự `CREATE TABLE IF NOT EXISTS` trước khi insert (an
 * toàn khi chạy lại nhiều lần / trên DB đã có sẵn bảng), không còn phụ
 * thuộc giả định "bảng có sẵn" nữa. Lỗi thật đã gặp:
 * `ER_NO_SUCH_TABLE: Table 'settings' doesn't exist`.
 *
 * Permission `uploads.manage_limits`: `supports_scope = FALSE` (nhị phân
 * thuần, không có khái niệm "chỉ phòng ban mình" - đây là cấu hình toàn
 * cục duy nhất cho cả hệ thống) - giống hệt convention của `audit.manage`
 * (migration `1778500000000-AddMissingRbacPermissions`). Mặc định cấp cho
 * admin + assistant, Admin có thể bật thêm cho Manager qua `/phan-quyen`
 * sau này nếu muốn.
 */
export class AddUploadSettingsAndPermission1780000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tự tạo bảng nếu chưa có (xem ghi chú FIX ở đầu file) — khớp đúng
    // `setting.entity.ts` (key PK varchar(100), value/description TEXT).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS settings (
        \`key\` VARCHAR(100) NOT NULL PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      INSERT INTO settings (\`key\`, value, description) VALUES
      ('upload_avatar_max_size_kb', '1024', 'Dung lượng tối đa 1 ảnh đại diện (KB, sau khi client resize/nén)'),
      ('upload_leave_attachment_max_size_kb', '1536', 'Dung lượng tối đa MỖI ảnh đính kèm đơn nghỉ phép (KB)'),
      ('upload_leave_attachment_max_count', '5', 'Số ảnh đính kèm tối đa cho 1 đơn nghỉ phép')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('uploads.manage_limits', 'uploads', 'manage_limits', FALSE, 'Chỉnh giới hạn số lượng/dung lượng ảnh upload (avatar, đính kèm nghỉ phép)')
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL
      FROM roles r, permissions p
      WHERE p.key = 'uploads.manage_limits'
        AND r.code IN ('admin', 'assistant');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM permissions WHERE \`key\` = 'uploads.manage_limits'`);
    await queryRunner.query(`
      DELETE FROM settings WHERE \`key\` IN (
        'upload_avatar_max_size_kb',
        'upload_leave_attachment_max_size_kb',
        'upload_leave_attachment_max_count'
      );
    `);
  }
}