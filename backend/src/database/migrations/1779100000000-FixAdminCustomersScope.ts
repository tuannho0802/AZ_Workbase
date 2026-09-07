import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FIX LỖI SEED NHỎ (phát hiện khi verify toàn bộ chuỗi migration RBAC bằng
 * cách chạy thật trên MySQL, đối chiếu dữ liệu thật trong bảng
 * `role_permissions` sau khi migrate xong): role `admin` đang có
 * `scope='department'` cho 3 permission `customers.manage`,
 * `customers.create`, `customers.edit` - ĐÚNG RA PHẢI LÀ `'all'` (Admin
 * không bao giờ bị giới hạn theo phòng ban, đây là nguyên tắc xuyên suốt
 * toàn bộ hệ thống - xem PERMISSIONS.md).
 *
 * Nguồn gốc lỗi: migration `AddDetailedRbacPermissions` (1778600000000) khi
 * seed lại `customers.manage` đã lỡ áp DÙNG CHUNG 1 khối SQL cho cả
 * admin/assistant/manager với scope tính theo role code, nhưng nhánh admin
 * bị gán nhầm theo đúng công thức của manager (`'department'`) thay vì
 * `'all'`. Migration `SplitCustomersManagePermission` (1778900000000) sau
 * đó copy nguyên trạng (bao gồm cả lỗi này) sang 2 permission mới
 * `customers.create`/`customers.edit` khi tách từ `customers.manage`.
 *
 * ⚠️ MỨC ĐỘ ẢNH HƯỞNG THỰC TẾ: THẤP - không phải lỗi bảo mật, không có
 * hành vi sai nào xảy ra trên thực tế, vì `PermissionGuard` VÀ tất cả
 * service liên quan (`CustomerAccessHelper`, v.v.) đều có lối thoát hiểm
 * tuyệt đối `if (role === Role.ADMIN) return true/allow-all` ĐỨNG TRƯỚC bất
 * kỳ kiểm tra `scope` nào - cột `scope` sai của admin trong DB KHÔNG BAO
 * GIỜ được đọc tới trong luồng xử lý thật. Lỗi này CHỈ biểu hiện ra ở tầng
 * hiển thị: nếu Admin tự mở trang `/phan-quyen` xem lại ma trận quyền của
 * chính role `admin`, UI sẽ hiển thị nhầm "Phạm vi: Phòng ban" cho 3 quyền
 * này thay vì "Toàn bộ" - gây hiểu lầm, không gây mất an toàn dữ liệu.
 * Sửa ở đây để dọn sạch, không phải vì có sự cố thật đã xảy ra.
 */
export class FixAdminCustomersScope1779100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      SET rp.scope = 'all'
      WHERE r.code = 'admin'
        AND p.key IN ('customers.manage', 'customers.create', 'customers.edit')
        AND rp.department_id IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Trả lại đúng giá trị SAI ban đầu - để down() thực sự đối xứng với
    // up(), không âm thầm "sửa luôn theo hướng khác" (cùng quy ước đã dùng
    // ở down() của SplitCustomersManagePermission).
    await queryRunner.query(`
      UPDATE role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      SET rp.scope = 'department'
      WHERE r.code = 'admin'
        AND p.key IN ('customers.manage', 'customers.create', 'customers.edit')
        AND rp.department_id IS NULL
    `);
  }
}
