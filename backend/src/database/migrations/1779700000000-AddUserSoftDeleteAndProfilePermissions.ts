import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Theo yêu cầu chủ dự án (2026-09-08): tính năng "Profile cá nhân tự chỉnh
 * sửa" + "Xoá tài khoản (mềm rồi mới cứng)". Migration này làm 2 việc độc
 * lập, gộp chung 1 file vì cùng 1 yêu cầu nghiệp vụ:
 *
 * 1. Thêm cột soft-delete cho `users` (trước đây KHÔNG có - chỉ có
 *    `isActive=false` qua update(), xem PERMISSIONS.md §2.2). Theo đúng quy
 *    ước `deleted_at` (không dùng `TIMESTAMP` mặc định CURRENT_TIMESTAMP -
 *    NULL nghĩa là chưa xoá, giống hệt `customers.deleted_at`). Thêm kèm
 *    `deleted_by_id` để biết AI đã bấm xoá mềm (phục vụ audit + hiển thị ở
 *    tab "Đã xoá") - tự SET NULL nếu chính người xoá sau này cũng bị xoá.
 *
 * 2. Seed 3 permission MỚI cho hệ thống Dynamic RBAC (mục 1.7
 *    PERMISSIONS.md), tách BẠCH khỏi `users.manage` (quyền Admin/Assistant/
 *    Manager sửa THÔNG TIN NGƯỜI KHÁC) vì đây là hành động "tự phục vụ" của
 *    CHÍNH người dùng trên hồ sơ CỦA HỌ, không phải quản trị nhân sự:
 *
 *    - `profile.edit_info` (supports_scope=TRUE): tự sửa tên/SĐT của CHÍNH
 *      MÌNH (loại trừ Email - xem `profile.edit_email` riêng). Mặc định
 *      scope='own' cho CẢ 4 role - vì bản chất endpoint `PATCH
 *      /users/me/profile` chỉ tác động lên CHÍNH người gọi (id lấy từ JWT,
 *      không nhận :id tuỳ ý) nên "own" là đủ; Admin vẫn có thể mở rộng scope
 *      qua `/phan-quyen` nếu sau này có nhu cầu dùng lại permission này cho
 *      1 endpoint khác rộng hơn.
 *    - `profile.change_password` (supports_scope=TRUE): tự đổi mật khẩu
 *      CHÍNH MÌNH (khác `users.manage` -> `resetPassword()` là ADMIN/
 *      MANAGER đặt lại mật khẩu CHO NGƯỜI KHÁC, không cần biết mật khẩu cũ).
 *      Mặc định scope='own' cho CẢ 4 role, cùng lý do trên.
 *    - `profile.edit_email` (supports_scope=TRUE): sửa Email - hành động
 *      NHẠY CẢM (email dùng để đăng nhập) nên mặc định CHỈ Admin
 *      (scope='all'), không seed cho 3 role còn lại - Admin có thể mở thêm
 *      cho Assistant/Manager qua `/phan-quyen` nếu muốn.
 *
 * Quyền XOÁ tài khoản (`users.delete`) đã tồn tại sẵn từ migration
 * `1778600000000-AddDetailedRbacPermissions` (supports_scope=FALSE, mặc
 * định chỉ Admin) - tái dùng lại, KHÔNG tạo permission mới, chỉ thêm 2
 * endpoint (soft-delete + hard-delete) đọc cùng permission này.
 */
export class AddUserSoftDeleteAndProfilePermissions1779700000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Soft-delete cho users
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN deleted_at TIMESTAMP NULL,
      ADD COLUMN deleted_by_id INT NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE users
      ADD CONSTRAINT FK_users_deleted_by
      FOREIGN KEY (deleted_by_id) REFERENCES users(id) ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_users_deleted_at ON users(deleted_at);
    `);

    // 2. Permission catalogue mới
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('profile.edit_info', 'profile', 'edit_info', TRUE, 'Tự sửa thông tin cá nhân (tên, SĐT) - không gồm Email'),
      ('profile.change_password', 'profile', 'change_password', TRUE, 'Tự đổi mật khẩu của chính mình'),
      ('profile.edit_email', 'profile', 'edit_email', TRUE, 'Sửa Email tài khoản')
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, 'own'
      FROM roles r, permissions p
      WHERE p.key IN ('profile.edit_info', 'profile.change_password')
        AND r.code IN ('admin', 'assistant', 'manager', 'employee');
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, 'all'
      FROM roles r, permissions p
      WHERE p.key = 'profile.edit_email' AND r.code = 'admin';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM permissions WHERE \`key\` IN (
        'profile.edit_info', 'profile.change_password', 'profile.edit_email'
      )
    `);

    await queryRunner.query(`ALTER TABLE users DROP FOREIGN KEY FK_users_deleted_by`);
    await queryRunner.query(`DROP INDEX idx_users_deleted_at ON users`);
    await queryRunner.query(`
      ALTER TABLE users
      DROP COLUMN deleted_at,
      DROP COLUMN deleted_by_id;
    `);
  }
}
