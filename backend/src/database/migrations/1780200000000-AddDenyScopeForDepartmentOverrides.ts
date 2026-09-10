import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm giá trị 'none' vào ENUM `role_permissions.scope` - dùng làm dấu hiệu
 * "TỪ CHỐI TƯỜNG MINH" cho dòng OVERRIDE THEO PHÒNG BAN (department_id KHÁC
 * NULL). Xem giải thích đầy đủ trong comment enum `PermissionScope`
 * (`database/entities/role-permission.entity.ts`).
 *
 * Bối cảnh bug thật đang sửa: trước migration này, muốn 1 phòng ban KHÔNG
 * có 1 permission mà Toàn cục đang bật, Admin buộc phải tắt permission đó ở
 * Toàn cục (ảnh hưởng MỌI phòng ban) rồi mới bật lại riêng cho từng phòng
 * ban khác qua Override - vì PermissionsService.loadRolePermissionMap()
 * luôn fallback về Toàn cục khi phòng ban không có dòng override cho đúng
 * permissionKey đó ("không có dòng" bị hiểu nhầm thành "kế thừa Toàn cục"
 * thay vì "từ chối"). Thêm sentinel 'none' cho phép override phòng ban ghi
 * 1 dòng tường minh "phòng ban này KHÔNG có quyền X" mà không đụng gì tới
 * ma trận Toàn cục hay các phòng ban khác.
 *
 * CHỈ ĐỔI ENUM COLUMN - không cần touch dữ liệu hiện có (mọi dòng cũ vẫn
 * giữ nguyên giá trị own/department/all/NULL, hoàn toàn tương thích ngược).
 */
export class AddDenyScopeForDepartmentOverrides1780200000000
  implements MigrationInterface
{
  name = 'AddDenyScopeForDepartmentOverrides1780200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE role_permissions
        MODIFY COLUMN scope ENUM('own', 'department', 'all', 'none') NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Trước khi thu hẹp lại ENUM, phải xoá (không phải chỉ đổi) mọi dòng
    // đang dùng 'none' - nếu không MySQL sẽ tự nắn giá trị lạ ('none' không
    // còn hợp lệ) thành chuỗi rỗng '' một cách ÂM THẦM, gây dữ liệu sai
    // KHÔNG BÁO LỖI thay vì fail rõ ràng như mong đợi khi rollback.
    await queryRunner.query(`DELETE FROM role_permissions WHERE scope = 'none'`);
    await queryRunner.query(`
      ALTER TABLE role_permissions
        MODIFY COLUMN scope ENUM('own', 'department', 'all') NULL
    `);
  }
}
