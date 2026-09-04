import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 2 sửa nhỏ, độc lập nhau, gộp chung 1 migration vì cùng liên quan
 * permission `users.view`:
 *
 * 1) Làm rõ mô tả: `users.view` KHÔNG chỉ điều khiển trang "/users" (Nhân
 *    viên) - nó CŨNG là permission duy nhất quyết định trang "/profile" có
 *    hiện chế độ "Xem Profile mọi người" (AdminProfileManager) hay chỉ
 *    "Xem Profile của chính mình" (xem profile/page.tsx - can('users.view')).
 *    Trước đây mô tả không nhắc gì tới Profile, dễ khiến Admin chỉnh ma
 *    trận ở trang "Phân quyền" mà không biết permission này ảnh hưởng cả 2
 *    nơi.
 *
 * 2) Sửa lỗi seed: migration `AddDetailedRbacPermissions` (1778600000000)
 *    gán `scope='department'` cho CẢ Assistant khi seed `users.view` - lặp
 *    lại đúng lỗi mà `AddMissingRbacPermissions` (1778500000000) đã từng
 *    sửa cho `users.manage` (Assistant không giới hạn theo phòng ban, xem
 *    PERMISSIONS.md mục 1). Hiện KHÔNG có tác dụng chức năng thật (
 *    UsersAccessHelper.applyViewFilter() vẫn dùng user.role trực tiếp, chưa
 *    đọc permissionScope - xem giải thích ở AddMissingRbacPermissions) -
 *    nhưng hiển thị SAI trên ma trận trang "Phân quyền", gây hiểu nhầm cho
 *    Admin. Sửa cho nhất quán dữ liệu.
 */
export class ClarifyUsersViewPermission1778800000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE permissions
      SET description = 'Xem danh sách/chi tiết nhân viên VÀ xem Profile (Fanpage/Group quản lý) của người khác - tắt quyền này thì trang Profile chỉ còn xem được của chính mình'
      WHERE \`key\` = 'users.view'
    `);

    await queryRunner.query(`
      UPDATE role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      SET rp.scope = 'all'
      WHERE r.code = 'assistant' AND p.key = 'users.view'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      SET rp.scope = 'department'
      WHERE r.code = 'assistant' AND p.key = 'users.view'
    `);

    await queryRunner.query(`
      UPDATE permissions
      SET description = 'Xem danh sách và chi tiết nhân viên'
      WHERE \`key\` = 'users.view'
    `);
  }
}
