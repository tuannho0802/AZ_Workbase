import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * YÊU CẦU MỚI TỪ NGƯỜI DÙNG (chat trực tiếp): tách quyền Xoá khách hàng
 * thành 2 mục RIÊNG BIỆT theo đúng mức độ rủi ro khác nhau của 2 hành động:
 *
 *  1. "Xoá mềm" (đưa vào thùng rác, CÓ THỂ khôi phục) - đã có sẵn permission
 *     `customers.delete` từ migration gốc `AddCustomRbacSystem`, nhưng CHƯA
 *     TỪNG có tác dụng thật (xem FIX ở `CustomerAccessHelper.canDelete()` +
 *     `customers.service.ts` cùng đợt sửa này) - KHÔNG cần migration DB nào
 *     thêm, chỉ cần sửa code để nó THỰC SỰ đọc theo `role_permissions` thay
 *     vì hardcode `role === admin`.
 *
 *  2. "Xoá vĩnh viễn" (hard delete, KHÔNG THỂ khôi phục) - trước đây dùng
 *     CHUNG 1 permission `customers.trash_manage` với 2 hành động ít rủi ro
 *     hơn nhiều (xem trash + khôi phục, `GET /customers/trash` và
 *     `PATCH /customers/trash/:id/restore`). Gộp chung nghĩa là: Admin muốn
 *     cấp cho 1 role được "xem/khôi phục thùng rác" (an toàn, có thể hoàn
 *     tác) BẮT BUỘC phải cấp kèm luôn quyền "xoá vĩnh viễn" (không thể hoàn
 *     tác) - vi phạm nguyên tắc PERMISSIONS.md §1.7 "mỗi permission chỉ nên
 *     tương ứng 1 hành động rõ nghĩa", và không cho phép cấu hình linh hoạt
 *     như người dùng yêu cầu.
 *
 * SỬA: tạo permission MỚI `customers.hard_delete` (supports_scope=FALSE,
 * nhị phân thuần - giống `customers.delete`/`customers.trash_manage`, hành
 * động này không có khái niệm "chỉ phòng ban mình"). `customers.trash_manage`
 * SAU migration này CHỈ còn nghĩa "xem thùng rác + khôi phục" - route
 * `DELETE /customers/trash/:id/hard-delete` ở controller đổi sang đòi
 * `customers.hard_delete` (xem thay đổi cùng lúc ở `customers.controller.ts`).
 *
 * Copy NGUYÊN TRẠNG toàn bộ role_permissions hiện có của `customers.trash_manage`
 * sang `customers.hard_delete` (chỉ có Admin tại thời điểm viết migration này -
 * xem `AddMissingRbacPermissions`) - không role nào bị mất quyền đang có,
 * Admin vẫn full quyền cả 2 mục ngay sau migrate. Admin có thể vào trang
 * "Phân quyền" tách cấu hình lại cho 2 permission độc lập bất cứ lúc nào.
 */
export class SplitCustomersHardDeletePermission1783000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('customers.hard_delete', 'customers', 'hard_delete', FALSE, 'Xoá vĩnh viễn khách hàng khỏi thùng rác (KHÔNG thể khôi phục)')
    `);

    // Copy nguyên trạng role_permissions của customers.trash_manage sang
    // permission mới - lấy permission_id qua subquery bằng key, không
    // hardcode id (có thể khác nhau giữa các môi trường DB).
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope)
      SELECT role_id, (SELECT id FROM permissions WHERE \`key\` = 'customers.hard_delete'), scope
      FROM role_permissions
      WHERE permission_id = (SELECT id FROM permissions WHERE \`key\` = 'customers.trash_manage')
    `);

    // Cập nhật lại mô tả customers.trash_manage cho đúng phạm vi CÒN LẠI sau
    // khi tách (chỉ còn xem + khôi phục, không còn xoá vĩnh viễn).
    await queryRunner.query(`
      UPDATE permissions
      SET description = 'Xem thùng rác và khôi phục khách hàng đã xoá mềm (KHÔNG bao gồm xoá vĩnh viễn)'
      WHERE \`key\` = 'customers.trash_manage'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE permissions
      SET description = 'Xem/khôi phục/xoá vĩnh viễn khách hàng trong thùng rác - chỉ Admin'
      WHERE \`key\` = 'customers.trash_manage'
    `);

    // Xoá permission mới tự CASCADE xoá role_permissions liên quan (FK ON
    // DELETE CASCADE ở migration gốc AddCustomRbacSystem).
    await queryRunner.query(`
      DELETE FROM permissions WHERE \`key\` = 'customers.hard_delete'
    `);
  }
}
