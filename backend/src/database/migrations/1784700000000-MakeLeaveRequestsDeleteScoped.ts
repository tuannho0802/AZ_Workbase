import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `leave_requests.delete` chuyển từ quyền NHỊ PHÂN (supports_scope=FALSE, chưa
 * từng có endpoint nào dùng - xem AddDetailedRbacPermissions1778600000000) sang
 * quyền CÓ SCOPE, để gate 3 hành động mới ở module Nghỉ phép:
 *  - Huỷ (xoá mềm -> cancelled_at) đơn ĐÃ DUYỆT/TỪ CHỐI từ tab Lịch sử;
 *  - Xoá vĩnh viễn đơn trong tab Thùng rác;
 *  - Các thao tác hàng loạt của 2 việc trên.
 * scope='all' -> mọi đơn; scope='department' -> đơn của phòng ban mình quản lý
 * (cùng rule `isEligibleApprover` với duyệt/sửa hộ).
 *
 * Mặc định vẫn CHỈ Admin (seed cũ chỉ gán cho role admin) - không cấp thêm cho
 * role nào. Vì roles.service bắt buộc quyền supports_scope=TRUE phải có scope,
 * mọi dòng role_permissions cũ đang scope NULL của permission này được nâng lên
 * 'all' (giữ nguyên hiệu lực: trước đây quyền nhị phân = làm được mọi đơn).
 *
 * Idempotent, không tạo/xoá bảng-cột.
 */
export class MakeLeaveRequestsDeleteScoped1784700000000 implements MigrationInterface {
  name = 'MakeLeaveRequestsDeleteScoped1784700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE permissions
      SET supports_scope = TRUE,
          description = 'Huỷ (xoá mềm) đơn đã duyệt/từ chối và xoá vĩnh viễn đơn trong thùng rác - theo scope'
      WHERE \`key\` = 'leave_requests.delete';
    `);

    await queryRunner.query(`
      UPDATE role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      SET rp.scope = 'all'
      WHERE p.\`key\` = 'leave_requests.delete'
        AND rp.scope IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      SET rp.scope = NULL
      WHERE p.\`key\` = 'leave_requests.delete';
    `);

    await queryRunner.query(`
      UPDATE permissions
      SET supports_scope = FALSE,
          description = 'Xoá đơn nghỉ phép'
      WHERE \`key\` = 'leave_requests.delete';
    `);
  }
}
