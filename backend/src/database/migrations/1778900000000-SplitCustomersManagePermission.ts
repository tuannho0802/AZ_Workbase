import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FIX BUG NGHIÊM TRỌNG ĐANG SỐNG: `customers.controller.ts` đã đổi route
 * `POST /customers` (tạo mới) và `PATCH /customers/:id` (sửa) sang đòi
 * `@RequirePermission('customers.create')`/`'customers.edit'` (tách riêng
 * khỏi `customers.manage` gộp chung trước đây), NHƯNG 2 permission này
 * CHƯA TỪNG được tạo trong bảng `permissions` - không có migration nào
 * seed chúng. Hậu quả: `PermissionsService.hasPermission()` luôn trả
 * `allowed: false` cho MỌI role không phải admin (không có dòng nào cho
 * 2 key này, kể cả trong bảng `permissions` chứ chưa nói `role_permissions`)
 * -> 403 Forbidden tuyệt đối khi Assistant/Manager/Employee tạo hoặc sửa
 * khách hàng. Admin không bị ảnh hưởng nhờ bypass cứng ở `PermissionGuard`
 * (`user.role === Role.ADMIN` luôn qua, bất kể DB) - đây chính là lý do
 * bug này "lọt lưới" nếu chỉ test bằng tài khoản Admin.
 *
 * SỬA: tạo 2 permission mới `customers.create`/`customers.edit`, copy toàn
 * bộ dòng `role_permissions` hiện có của `customers.manage` sang CẢ 2
 * permission mới với CÙNG `scope` (không role nào bị mất quyền đang có).
 *
 * Đồng thời sửa luôn lỗi seed LẶP LẠI LẦN THỨ 3 cùng 1 loại: migration
 * `AddDetailedRbacPermissions` (1778600000000) gán `scope='department'`
 * cho CẢ Assistant khi seed `customers.manage` - sai với rule xuyên suốt
 * dự án "Assistant = Admin trừ Xoá, KHÔNG giới hạn theo phòng ban" (2 lần
 * trước đã sửa ở `AddMissingRbacPermissions` cho `users.manage` và
 * `ClarifyUsersViewPermission` cho `users.view`). Khác với 2 lần trước
 * (lúc đó CustomerAccessHelper/UsersAccessHelper còn dùng `user.role` trực
 * tiếp nên seed sai KHÔNG có tác dụng chức năng thật), lần này ĐÃ CÓ tác
 * dụng thật vì `CustomerAccessHelper` đã đọc `permissionScope` (xem
 * PERMISSIONS.md mục 1.7/Việc 1) - Assistant đang bị giới hạn sai theo
 * phòng ban khi tạo/sửa khách hàng ngay bây giờ nếu không sửa ở đây.
 *
 * KHÔNG xoá `customers.manage` khỏi bảng `permissions` - vẫn còn đang được
 * dùng riêng cho route `POST /customers/:id/deposits` (tạo lượt nạp tiền),
 * không thuộc phạm vi tách Create/Edit này.
 */
export class SplitCustomersManagePermission1778900000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('customers.create', 'customers', 'create', TRUE, 'Tạo mới khách hàng'),
      ('customers.edit', 'customers', 'edit', TRUE, 'Chỉnh sửa thông tin khách hàng')
    `);

    // Copy nguyên trạng role_permissions của customers.manage sang cả 2
    // permission mới - lấy permission_id qua subquery bằng key, không
    // hardcode số id (id có thể khác nhau giữa các môi trường DB).
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT role_id, (SELECT id FROM permissions WHERE \`key\` = 'customers.create'), scope
      FROM role_permissions
      WHERE permission_id = (SELECT id FROM permissions WHERE \`key\` = 'customers.manage')
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT role_id, (SELECT id FROM permissions WHERE \`key\` = 'customers.edit'), scope
      FROM role_permissions
      WHERE permission_id = (SELECT id FROM permissions WHERE \`key\` = 'customers.manage')
    `);

    // Sửa lỗi seed lặp lại lần 3 (xem giải thích đầy đủ ở JSDoc đầu file):
    // Assistant không giới hạn theo phòng ban - áp cho CẢ 3 permission
    // (manage gốc + 2 permission mới vừa copy từ nó).
    await queryRunner.query(`
      UPDATE role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      SET rp.scope = 'all'
      WHERE r.code = 'assistant'
        AND p.key IN ('customers.manage', 'customers.create', 'customers.edit')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Trả lại đúng scope='department' cho assistant ở customers.manage
    // (khôi phục nguyên trạng trước migration này - dù là giá trị sai, để
    // down() thực sự đối xứng với up(), không âm thầm "sửa luôn" 1 lần
    // nữa theo hướng khác).
    await queryRunner.query(`
      UPDATE role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      SET rp.scope = 'department'
      WHERE r.code = 'assistant' AND p.key = 'customers.manage'
    `);

    // Xoá 2 permission mới tự CASCADE xoá role_permissions liên quan (FK
    // ON DELETE CASCADE ở migration gốc AddCustomRbacSystem) - không cần
    // DELETE role_permissions riêng.
    await queryRunner.query(`
      DELETE FROM permissions WHERE \`key\` IN ('customers.create', 'customers.edit')
    `);
  }
}
