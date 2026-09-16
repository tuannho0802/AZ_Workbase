import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * YÊU CẦU MỚI TỪ NGƯỜI DÙNG (chat trực tiếp): trang "Lịch sử Công việc"
 * (`/lich-su-cong-viec` - log audit GỘP của mọi Công việc định kỳ, filter +
 * bulk xoá/dọn dẹp) hiện ĐANG DÙNG CHUNG permission `periodic_tasks.view`
 * với chính trang "Công việc định kỳ" (danh sách/chi tiết task) - xem 2
 * endpoint `GET /periodic-tasks/audit-logs` và `GET
 * /periodic-tasks/audit-logs/actions` ở `periodic-tasks.controller.ts`
 * (cùng đợt sửa migration này) + `nav-config.tsx` (mục `lich-su-cong-viec`).
 *
 * Gộp chung nghĩa là: Admin KHÔNG THỂ cấu hình 1 role được xem danh sách
 * Công việc định kỳ nhưng KHÔNG được xem trang Lịch sử gộp (hoặc ngược lại)
 * - vi phạm nguyên tắc PERMISSIONS.md §1.7 "mỗi permission chỉ nên tương ứng
 * 1 hành động rõ nghĩa", giống hệt lý do đã tách `customers.hard_delete`
 * khỏi `customers.trash_manage` ở migration `SplitCustomersHardDeletePermission`.
 *
 * ⚠️ CHỈ tách phần "trang Lịch sử GỘP" (2 endpoint `audit-logs`/`audit-logs/actions`
 * ở trên) - KHÔNG đụng tới endpoint lịch sử CỦA 1 Task cụ thể
 * (`GET /periodic-tasks/:id/audit-logs`, hiện trong tab lịch sử của Task đó)
 * - endpoint này vẫn giữ NGUYÊN `periodic_tasks.view` vì nó là 1 phần thông
 * tin PHỤ của chính Task đang xem, đúng phạm vi "xem được Task thì xem được
 * lịch sử của Task đó", không cần tách permission riêng. Bulk xoá/dọn dẹp log
 * (`DELETE .../audit-logs/bulk`, `.../audit-logs/cleanup`) cũng KHÔNG đụng -
 * vẫn giữ nguyên `periodic_tasks.delete` như từ trước.
 *
 * SỬA: tạo permission MỚI `periodic_tasks.audit_view` (supports_scope=TRUE,
 * mirror ĐÚNG `periodic_tasks.view` - trang Lịch sử gộp cũng lọc theo
 * scope own/department/all giống danh sách Task, xem
 * `PeriodicTaskAuditService.getGlobalLogs()`). Copy NGUYÊN TRẠNG toàn bộ
 * `role_permissions` hiện có của `periodic_tasks.view` sang permission mới
 * này - copy ĐẦY ĐỦ cả `department_id`/`position_id` (không chỉ `scope` như
 * migration `SplitCustomersHardDeletePermission` trước đây, vì permission đó
 * tại thời điểm tách chưa có override nào theo phòng ban/vị trí - còn
 * `periodic_tasks.view` ở dự án hiện tại CÓ THỂ đã có override) - không role
 * nào (kể cả role tuỳ chỉnh Admin tự tạo) bị mất quyền đang có, mọi role vẫn
 * vào được trang Lịch sử ngay sau migrate y hệt trước đây. Admin có thể vào
 * trang "Phân quyền" tách cấu hình lại cho 2 permission độc lập bất cứ lúc
 * nào sau đó.
 */
export class SplitPeriodicTasksAuditViewPermission1783200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (\`key\`, resource, action, supports_scope, description) VALUES
      ('periodic_tasks.audit_view', 'periodic_tasks', 'audit_view', TRUE,
       'Xem trang Lịch sử Công việc (log audit GỘP của mọi Công việc định kỳ trong phạm vi scope) - KHÔNG bao gồm lịch sử riêng của 1 Task (vẫn dùng periodic_tasks.view)')
    `);

    // Copy nguyên trạng role_permissions của periodic_tasks.view sang
    // permission mới - lấy permission_id qua subquery bằng key (không
    // hardcode id, có thể khác nhau giữa các môi trường DB), copy ĐẦY ĐỦ cả
    // department_id/position_id để không làm mất override đang áp dụng.
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id, scope, department_id, position_id)
      SELECT role_id, (SELECT id FROM permissions WHERE \`key\` = 'periodic_tasks.audit_view'),
             scope, department_id, position_id
      FROM role_permissions
      WHERE permission_id = (SELECT id FROM permissions WHERE \`key\` = 'periodic_tasks.view')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Xoá permission mới tự CASCADE xoá role_permissions liên quan (FK ON
    // DELETE CASCADE ở migration gốc AddCustomRbacSystem).
    await queryRunner.query(`
      DELETE FROM permissions WHERE \`key\` = 'periodic_tasks.audit_view'
    `);
  }
}
