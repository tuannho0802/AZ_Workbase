import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * TÁCH `customers.note` (gộp chung, chỉ dùng cho tạo mới) thành 3 permission
 * riêng biệt theo đúng yêu cầu nghiệp vụ "Dynamic (Mở khoá quyền Create Edit
 * Delete riêng biệt)" cho Ghi chú khách hàng (customer_notes):
 *
 *  - customer_notes.create : tạo ghi chú mới cho 1 khách hàng
 *  - customer_notes.edit   : sửa nội dung/loại ghi chú đã tạo trước đó
 *  - customer_notes.delete : xoá ghi chú
 *
 * Trước đây CHỈ CÓ endpoint tạo (`POST /customers/:id/notes`, gắn
 * `customers.note`) - KHÔNG có endpoint sửa/xoá ghi chú nào cả (xem
 * `CustomersController`/`CustomersService` trước migration này) - đây là
 * phần triển khai BỔ SUNG đầy đủ CRUD, đi kèm đúng permission riêng cho
 * từng hành động thay vì dùng chung 1 permission "note" cho cả 3 việc.
 *
 * Quyền EDIT/DELETE mặc định seed CHẶT hơn CREATE - chỉ Admin+Assistant có
 * scope rộng (all/department theo đúng vai trò), Manager/Employee CHỈ được
 * sửa/xoá ghi chú CHÍNH MÌNH tạo ra (enforce ở tầng service qua
 * `CustomerNoteAccessHelper`, không phải ở permission scope - xem service).
 * Đây là lựa chọn nghiệp vụ hợp lý: cho phép ai cũng ghi chú chăm sóc tự do
 * (ghi chú là lịch sử làm việc thông thường), nhưng KHÔNG cho tự ý sửa/xoá
 * ghi chú của đồng nghiệp khác trừ khi có quyền quản lý rộng hơn (Admin/
 * Assistant, hoặc Manager trong phạm vi phòng ban mình quản lý).
 *
 * KHÔNG xoá `customers.note` khỏi bảng `permissions` (giữ nguyên, không còn
 * code nào tham chiếu) - cùng triết lý bảo toàn dữ liệu như migration
 * `SplitCustomersManagePermission` trước đó, tránh xoá mất cấu hình
 * `role_permissions` mà Admin có thể đã tự tuỳ chỉnh qua trang Phân quyền.
 */
export class SplitCustomerNotesPermissions1779200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('customer_notes.create', 'customer_notes', 'create', TRUE, 'Thêm ghi chú, lịch sử chăm sóc khách hàng'),
      ('customer_notes.edit', 'customer_notes', 'edit', TRUE, 'Sửa nội dung ghi chú khách hàng'),
      ('customer_notes.delete', 'customer_notes', 'delete', TRUE, 'Xoá ghi chú khách hàng')
    `);

    // customer_notes.create: copy NGUYÊN TRẠNG scope từ customers.note hiện
    // có (không role nào bị mất quyền đang có).
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT role_id, (SELECT id FROM permissions WHERE \`key\` = 'customer_notes.create'), scope
      FROM role_permissions
      WHERE permission_id = (SELECT id FROM permissions WHERE \`key\` = 'customers.note')
    `);

    // customer_notes.edit/delete: seed CHẶT hơn create - chỉ Admin/Assistant
    // (scope='all') và Manager (scope='department') - Employee KHÔNG có 2
    // quyền này ở mức permission (chỉ tự sửa/xoá được ghi chú CHÍNH MÌNH tạo
    // qua rule "own note" enforce riêng ở service, không cần permission
    // scope='own' cho việc này).
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, 'all' FROM roles r, permissions p
      WHERE r.code IN ('admin', 'assistant') AND p.key IN ('customer_notes.edit', 'customer_notes.delete');
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id, 'department' FROM roles r, permissions p
      WHERE r.code = 'manager' AND p.key IN ('customer_notes.edit', 'customer_notes.delete');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Xoá 3 permission mới tự CASCADE xoá role_permissions liên quan (FK
    // ON DELETE CASCADE ở migration gốc AddCustomRbacSystem).
    await queryRunner.query(`
      DELETE FROM permissions WHERE \`key\` IN
        ('customer_notes.create', 'customer_notes.edit', 'customer_notes.delete')
    `);
  }
}
