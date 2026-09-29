import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Từ chối đăng ký giờ = xoá mềm (xem `UsersService.rejectUser()`). Dọn các tài khoản ĐÃ bị từ chối từ trước nhưng
 * chưa xoá mềm: set `deleted_at` (lấy `approved_at` - thời điểm từ chối, nếu thiếu thì NOW) và `deleted_by_id`
 * (= người từ chối) để chúng rời danh sách Nhân viên và xuất hiện ở Thùng rác. Chỉ đụng dòng rejected chưa xoá.
 * `down()` chỉ gỡ dấu xoá cho ĐÚNG các dòng rejected (không hoàn tác được dòng nào đã xoá mềm từ trước migration).
 */
export class SoftDeleteRejectedUsers1784900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users
      SET deleted_at = COALESCE(approved_at, NOW()), deleted_by_id = approved_by_id
      WHERE approval_status = 'rejected' AND deleted_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users SET deleted_at = NULL, deleted_by_id = NULL
      WHERE approval_status = 'rejected' AND deleted_at IS NOT NULL
    `);
  }
}
