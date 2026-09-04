import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FIX BUG NGHIÊM TRỌNG: 8 permission key đã được gắn vào `@RequirePermission()`
 * ở nhiều controller (customers, zk-device, departments, link-groups,
 * link-categories, media-sources - xem PERMISSIONS.md mục 1.7/4) nhưng CHƯA
 * TỪNG được seed vào bảng `permissions`/`role_permissions` ở migration gốc
 * (`AddCustomRbacSystem`, chỉ seed đúng 12 permission ban đầu).
 *
 * Hậu quả trước migration này: `PermissionsService.hasPermission()` luôn trả
 * `allowed: false` cho 8 permission này với MỌI role KHÔNG PHẢI admin (không
 * có dòng nào trong `role_permissions`, kể cả không có dòng trong
 * `permissions`) -> 403 Forbidden tuyệt đối cho Assistant/Manager, dù
 * `PERMISSIONS.md` quy định rõ Assistant phải ngang Admin (trừ Xoá) cho các
 * module đó. Admin không bị ảnh hưởng nhờ bypass cứng ở `PermissionGuard`
 * (`user.role === Role.ADMIN` luôn qua, bất kể DB) - đây chính là lý do bug
 * này "lọt lưới" test thủ công (dev/QA hay test bằng tài khoản Admin).
 *
 * Đồng thời sửa 1 lỗi seed dữ liệu nhỏ ở migration gốc: `users.manage` gán
 * `scope='department'` cho CẢ Assistant (dòng
 * `WHERE r.code IN ('admin','assistant','manager')` dùng chung 1 giá trị
 * 'department' cho cả 3 role) - sai với rule "Assistant không giới hạn theo
 * phòng ban". Hiện KHÔNG có tác dụng thực tế (UsersAccessHelper chưa đọc
 * `permissionScope`, vẫn dùng `user.role` trực tiếp - xem mục 1.7) nhưng sẽ
 * hiển thị SAI trên ma trận trang "Phân quyền" nếu không sửa - sửa luôn ở
 * đây cho nhất quán dữ liệu.
 *
 * Role gán cho từng permission mới lấy ĐÚNG theo `@Roles()` tĩnh lịch sử
 * trước khi migrate (đối chiếu qua git log, KHÔNG suy đoán theo rule chung ở
 * mục 1 - vài endpoint này vốn đã hẹp hơn rule chung theo chủ đích, ví dụ
 * "Report dữ liệu lỗi"/"Trash" vốn chỉ Admin, không mở cho Assistant):
 *  - customers.invalid_report : ADMIN                    (cũ: @Roles(ADMIN))
 *  - customers.trash_manage   : ADMIN                    (cũ: @Roles(ADMIN))
 *  - customers.import         : ADMIN, MANAGER, ASSISTANT (cũ: @Roles(ADMIN, MANAGER, ASSISTANT))
 *  - attendance.delete        : ADMIN                    (cũ: @Roles(ADMIN) riêng cho cleanup log)
 *  - departments.manage       : ADMIN, ASSISTANT          (cũ: @Roles(ADMIN, ASSISTANT))
 *  - link_groups.manage       : ADMIN, ASSISTANT          (cũ: @Roles(ADMIN, ASSISTANT))
 *  - link_groups.delete       : ADMIN                    (cũ: @Roles(ADMIN))
 *  - media_sources.manage     : ADMIN, ASSISTANT          (cũ: @Roles(ADMIN, ASSISTANT))
 *  - media_sources.delete     : ADMIN                    (cũ: @Roles(ADMIN))
 *  - audit.manage              : ADMIN, ASSISTANT          (mới - dùng để migrate audit.controller.ts
 *                                                            khỏi @Roles() tĩnh cuối cùng còn sót lại,
 *                                                            xem audit.controller.ts - cả 6 endpoint vốn
 *                                                            đồng nhất @Roles(ADMIN, ASSISTANT))
 *
 * Toàn bộ permission mới `supports_scope = FALSE` (nhị phân thuần, giống
 * `customers.delete`/`roles.manage`) - các action này không có khái niệm
 * "chỉ phòng ban mình" (module chưa gắn với department, hoặc là hành động
 * quản trị toàn cục như import/report/trash), khớp đúng thiết kế hiện tại
 * (Manager không được cấp các quyền này ở bất kỳ module nào trong danh sách
 * trên - xem PERMISSIONS.md mục 2.4/2.5/2.9 "Manager không có quyền ghi").
 */
export class AddMissingRbacPermissions1778500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('customers.invalid_report', 'customers', 'invalid_report', FALSE, 'Xem report khách hàng có dữ liệu không hợp lệ - chỉ Admin'),
      ('customers.trash_manage', 'customers', 'trash_manage', FALSE, 'Xem/khôi phục/xoá vĩnh viễn khách hàng trong thùng rác - chỉ Admin'),
      ('customers.import', 'customers', 'import', FALSE, 'Import khách hàng từ file Excel'),
      ('attendance.delete', 'attendance', 'delete', FALSE, 'Dọn dẹp (xoá vĩnh viễn) log chấm công cũ - chỉ Admin'),
      ('departments.manage', 'departments', 'manage', FALSE, 'Tạo/sửa phòng ban, gán Manager quản lý'),
      ('link_groups.manage', 'link_groups', 'manage', FALSE, 'Tạo/sửa/khoá-mở Category và Group liên kết'),
      ('link_groups.delete', 'link_groups', 'delete', FALSE, 'Xoá Category/Group liên kết - chỉ Admin'),
      ('media_sources.manage', 'media_sources', 'manage', FALSE, 'Tạo/sửa/khoá-mở Nguồn Media'),
      ('media_sources.delete', 'media_sources', 'delete', FALSE, 'Xoá Nguồn Media - chỉ Admin'),
      ('audit.manage', 'audit', 'manage', FALSE, 'Xem/cấu hình/dọn dẹp Audit Logs');
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r, permissions p
      WHERE r.code = 'admin'
        AND p.key IN ('customers.invalid_report', 'customers.trash_manage', 'attendance.delete',
                       'link_groups.delete', 'media_sources.delete');
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r, permissions p
      WHERE r.code IN ('admin', 'assistant')
        AND p.key IN ('departments.manage', 'link_groups.manage', 'media_sources.manage', 'audit.manage');
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL FROM roles r, permissions p
      WHERE r.code IN ('admin', 'manager', 'assistant') AND p.key = 'customers.import';
    `);

    // Sửa lỗi seed cũ: Assistant KHÔNG bị giới hạn theo phòng ban (đúng rule
    // mục 1) - migration gốc lỡ gán chung 'department' cho cả 3 role.
    await queryRunner.query(`
      UPDATE role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      SET rp.scope = 'all'
      WHERE r.code = 'assistant' AND p.key = 'users.manage';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      SET rp.scope = 'department'
      WHERE r.code = 'assistant' AND p.key = 'users.manage';
    `);

    await queryRunner.query(`
      DELETE FROM permissions WHERE \`key\` IN (
        'customers.invalid_report', 'customers.trash_manage', 'customers.import',
        'attendance.delete', 'departments.manage', 'link_groups.manage',
        'link_groups.delete', 'media_sources.manage', 'media_sources.delete',
        'audit.manage'
      );
    `);
    // Xoá permissions tự CASCADE xoá role_permissions liên quan (FK
    // ON DELETE CASCADE ở migration gốc) - không cần DELETE riêng.
  }
}
