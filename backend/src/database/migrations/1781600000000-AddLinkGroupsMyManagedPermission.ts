import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix bug thật phát hiện qua ảnh chụp người dùng (2026-09-11): mục nav
 * "Nhóm tôi quản lý" (`/nhom-toi-quan-ly`) trước đây `roles: null` KHÔNG có
 * field `permission` nào ở nav-config.tsx - hiện với MỌI role đã đăng nhập,
 * bất kể Admin đã tắt hết quyền khác qua trang Phân quyền hay chưa. Người
 * dùng test 1 role chỉ bật "Profile"+"Nghỉ phép", tắt hết còn lại, nhưng mục
 * này vẫn hiện ở sidebar - không đồng bộ với các mục nav khác (đều có
 * `permission` khớp `@RequirePermission()` ở BE, xem PERMISSIONS.md mục 1.7).
 *
 * KHÔNG tái dùng `link_groups.view` (đã gán cho `/nhom-lien-ket` - trang CRUD
 * Category/Group của Admin/Assistant, xem AddDetailedRbacPermissions1778600000000)
 * vì đây là 2 khái niệm khác nhau: `/nhom-lien-ket` là trang quản trị chung,
 * còn `/nhom-toi-quan-ly` là trang CÁ NHÂN (xem nhóm CHÍNH MÌNH được gán làm
 * quản lý chính/phụ - mô hình quyền theo tài nguyên cụ thể, xem PERMISSIONS.md
 * mục 1.6/2.4) - 1 Employee có thể được gán quản lý 1 group dù không có
 * `link_groups.view`. Gộp chung 2 permission sẽ khiến Admin tắt
 * `link_groups.view` cho Employee (đúng ý "Employee không cần vào trang CRUD
 * chung") lại vô tình ẩn luôn trang cá nhân của chính họ - sai mục đích.
 *
 * Permission MỚI chỉ gate VIỆC XEM trang (giống hệt pattern `positions.view` -
 * nhị phân, không có scope, vì dữ liệu HIỂN THỊ bên trong trang đã tự lọc
 * đúng theo user đang đăng nhập ở BE (`GET /link-groups/managed-by-me`),
 * không cần thêm 1 lớp scope own/department/all nào nữa). Seed mặc định CẢ 4
 * role = bật, đúng hành vi hiện tại (`roles: null` = ai cũng thấy) - Admin có
 * thể tắt riêng cho từng role qua `/phan-quyen` sau khi có migration này.
 */
export class AddLinkGroupsMyManagedPermission1781600000000
  implements MigrationInterface
{
  name = 'AddLinkGroupsMyManagedPermission1781600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('link_groups.my_managed', 'link_groups', 'my_managed', FALSE, 'Xem trang "Nhóm tôi quản lý" (nhóm liên kết bản thân là quản lý chính/phụ)')
      ON DUPLICATE KEY UPDATE \`key\` = \`key\`;
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, NULL
      FROM roles r, permissions p
      WHERE p.key = 'link_groups.my_managed'
        AND r.code IN ('admin', 'assistant', 'manager', 'employee');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE rp FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.key = 'link_groups.my_managed';
    `);
    await queryRunner.query(`DELETE FROM permissions WHERE \`key\` = 'link_groups.my_managed'`);
  }
}
