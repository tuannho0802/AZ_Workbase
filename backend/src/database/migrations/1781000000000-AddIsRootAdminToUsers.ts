import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ⚠️ THAY ĐỔI QUAN TRỌNG VỀ BẢO MẬT - đọc kỹ trước khi sửa liên quan.
 *
 * Trước migration này, MỌI user có `role = 'admin'` (Role.ADMIN, cố định
 * trong code) đều tự động có "lối thoát hiểm" tuyệt đối ở PermissionGuard/
 * RolesService.getMyPermissions()/LinkGroupManagersService/UiVisibilityService
 * - bất kể `role_permissions`/`ui_visibility_rules` trong DB cấu hình gì.
 *
 * Từ migration này, lối thoát hiểm đó CHỈ áp dụng cho user có
 * `is_root_admin = TRUE` (theo yêu cầu tường minh từ chủ dự án). Có thể có
 * NHIỀU hơn 1 Root Admin. User mang `role = 'admin'` nhưng `is_root_admin =
 * FALSE` giờ đi qua ĐÚNG luồng kiểm tra `role_permissions`/
 * `ui_visibility_rules` như mọi role khác - Admin (thường) CÓ THỂ bị Root
 * Admin thu hồi quyền/ẩn field qua trang "Phân quyền" như bình thường.
 *
 * Root Admin LUÔN giữ đủ quyền dù ma trận quyền của role `admin` bị sửa/thu
 * hồi thế nào đi nữa (bypass tách biệt hoàn toàn khỏi `role_permissions`).
 *
 * MẶC ĐỊNH: TẤT CẢ user hiện có mang `role = 'admin'` được set
 * `is_root_admin = TRUE` ngay trong migration này - tránh tình huống chạy
 * xong migration xong KHÔNG CÒN Root Admin nào (tự khoá toàn bộ hệ thống,
 * không ai còn lối thoát hiểm để tự cấp lại quyền). Admin nào KHÔNG nên là
 * Root Admin thì tự tay Admin/Root Admin khác vào `/users` bỏ tick sau.
 */
export class AddIsRootAdminToUsers1781000000000 implements MigrationInterface {
  name = 'AddIsRootAdminToUsers1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const usersTable = await queryRunner.getTable('users');
    if (!usersTable?.findColumnByName('is_root_admin')) {
      // MySQL không hỗ trợ "ADD COLUMN IF NOT EXISTS" - kiểm tra tồn tại
      // trước qua getTable(), đúng pattern đã dùng ở AddPositionsTable.
      await queryRunner.query(`
        ALTER TABLE users
        ADD COLUMN is_root_admin TINYINT(1) NOT NULL DEFAULT 0
        AFTER role;
      `);
    }

    // Seed: mọi user role='admin' hiện có -> Root Admin, xem giải thích ở
    // JSDoc class - tránh khoá cứng hệ thống ngay sau khi deploy migration.
    await queryRunner.query(`
      UPDATE users SET is_root_admin = 1 WHERE role = 'admin';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const usersTable = await queryRunner.getTable('users');
    if (usersTable?.findColumnByName('is_root_admin')) {
      await queryRunner.query(`ALTER TABLE users DROP COLUMN is_root_admin;`);
    }
  }
}
