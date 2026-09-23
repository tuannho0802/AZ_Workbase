import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm permission `customers.export` (Xuất Excel danh sách khách hàng).
 *
 * TÁCH RIÊNG khỏi `customers.view` (không tái dùng thẳng) dù phạm vi dữ liệu
 * hoàn toàn giống nhau - lý do: đây là 1 hành động RIÊNG (tải dữ liệu ra khỏi
 * hệ thống dưới dạng file) mà Admin có thể muốn bật/tắt độc lập với quyền
 * xem thông thường qua trang "/phan-quyen" (vd: 1 role được xem danh sách
 * trên UI nhưng KHÔNG được phép tải hàng loạt ra file). Có
 * `supports_scope = TRUE` và seed CÙNG scope với `customers.view` cho từng
 * role hệ thống (xem AddCustomRbacSystem1778400000000) - đảm bảo mặc định
 * ngay sau migration này, "Export" trả về ĐÚNG những gì "Xem" đang cho phép
 * thấy (rule bắt buộc: đồng bộ dữ liệu xuất ra với dữ liệu hiển thị trên
 * UI), Admin có thể tuỳ chỉnh riêng sau đó qua UI như mọi permission khác.
 *
 * Role gán mặc định = ĐÚNG 4 role hệ thống đang có `customers.view` (không
 * loại trừ Employee - khác `customers.import` vốn chỉ Admin/Manager/
 * Assistant vì import là hành động NHẬP liệu, còn export chỉ là hành động
 * TẢI VỀ đúng phạm vi khách hàng mà chính role đó đã được xem, không có rủi
 * ro ghi/sửa dữ liệu).
 */
export class AddCustomersExportPermission1783800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('customers.export', 'customers', 'export', TRUE, 'Xuất Excel danh sách khách hàng (kèm ghi chú) - phạm vi dữ liệu giống hệt customers.view');
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT r.id, p.id,
        CASE
          WHEN r.code = 'admin' THEN 'all'
          WHEN r.code = 'manager' THEN 'department'
          WHEN r.code = 'assistant' THEN 'all'
          WHEN r.code = 'employee' THEN 'own'
        END
      FROM roles r
      CROSS JOIN permissions p
      WHERE p.key = 'customers.export';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM permissions WHERE \`key\` = 'customers.export';
    `);
    // Xoá permissions tự CASCADE xoá role_permissions liên quan (FK
    // ON DELETE CASCADE ở migration gốc) - không cần DELETE riêng.
  }
}
