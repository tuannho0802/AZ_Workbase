import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Theo yêu cầu chủ dự án (2026-09-08, sau khi vá bug 403 thật ở
 * `SplitCustomersManagePermission` - xem PERMISSIONS.md mục 3): tách hành
 * động "tick đã tham gia nhóm / rời nhóm" của 1 khách hàng
 * (`PATCH /customers/:id/group-memberships/:groupId`) ra khỏi `customers.edit`
 * thành 1 permission RIÊNG - `customer_group_memberships.set`.
 *
 * LÝ DO tách riêng (không tiếp tục dùng chung `customers.edit` dù bug 403 đã
 * vá xong ở migration trước):
 *  1. Đây là 1 hành động nghiệp vụ khác hẳn "sửa thông tin chung khách hàng"
 *     (đổi tên/SĐT/nguồn/trạng thái...) - cần bảng điều khiển phân quyền
 *     riêng để Admin bật/tắt độc lập qua trang `/phan-quyen`, không bị buộc
 *     chung với toàn bộ quyền sửa khác.
 *  2. Cho phép 1 "ngoại lệ" đúng ý nghiệp vụ: use case tick chọn nhóm NGAY
 *     LÚC TẠO MỚI khách hàng (`CustomerForm.tsx` - GroupPickerModal, gọi
 *     `setMembership()` ngay sau `POST /customers`) không còn phải phụ
 *     thuộc vào việc role đó có được cấp `customers.edit` hay không - chỉ
 *     cần permission mới này (mặc định seed sẵn cho Employee ở scope='own',
 *     xem bên dưới) là dùng được ngay khi vừa tạo xong khách hàng của chính
 *     mình, tách bạch khỏi khả năng sửa các trường thông tin khác của KH.
 *
 * Guard/scope: dùng lại ĐÚNG cơ chế cũ (`PermissionGuard` +
 * `CustomerAccessHelper.applyViewFilter()` qua `assertCustomerAccessible()`
 * trong `CustomerGroupMembershipsService`) - chỉ đổi permission KEY được
 * yêu cầu ở decorator `@RequirePermission()` của route PATCH, không đổi
 * logic chặn. GET (xem checklist) giữ nguyên `customers.view` - xem được
 * checklist không cần quyền tick.
 *
 * Mặc định seed theo ĐÚNG bảng chuẩn ở PERMISSIONS.md mục 1 (giống hệt cột
 * "Sửa" của `customers.view`/`customers.note` ở migration gốc
 * `AddCustomRbacSystem`) - Admin/Assistant toàn quyền, Manager theo phòng
 * ban, Employee CHỈ phạm vi dữ liệu của chính mình (theo đúng yêu cầu tường
 * minh "cho phép với data của chính mình trước") - Admin có thể mở rộng scope
 * cho từng role qua UI `/phan-quyen` bất cứ lúc nào sau đó, không cần deploy
 * lại.
 */
export class AddCustomerGroupMembershipSetPermission1779600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('customer_group_memberships.set', 'customer_group_memberships', 'set', TRUE,
       'Bật/tắt trạng thái đã tham gia nhóm (checklist "Nhóm") của khách hàng')
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id,
        CASE
          WHEN r.code = 'admin' THEN 'all'
          WHEN r.code = 'assistant' THEN 'all'
          WHEN r.code = 'manager' THEN 'department'
          WHEN r.code = 'employee' THEN 'own'
        END
      FROM roles r, permissions p
      WHERE p.key = 'customer_group_memberships.set'
        AND r.code IN ('admin', 'assistant', 'manager', 'employee');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Xoá permission tự CASCADE xoá các dòng role_permissions liên quan (FK
    // ON DELETE CASCADE từ migration gốc AddCustomRbacSystem).
    await queryRunner.query(`
      DELETE FROM permissions WHERE \`key\` = 'customer_group_memberships.set'
    `);
  }
}
