import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm cột phê duyệt tài khoản cho tính năng "nhân viên tự đăng ký" (POST
 * /auth/register) - tài khoản mới tạo qua form đăng ký công khai sẽ ở trạng
 * thái 'pending' cho tới khi Admin/Assistant duyệt, tránh spam account.
 *
 * Tài khoản do Admin tự tạo qua "Thêm nhân viên" (UsersService.create, dùng
 * nội bộ) vẫn giữ hành vi cũ - coi như đã duyệt sẵn (approved), không cần
 * qua bước chờ.
 */
export class AddUserApprovalStatus1778000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN approval_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'approved',
      ADD COLUMN approved_by_id INT NULL,
      ADD COLUMN approved_at TIMESTAMP NULL,
      ADD COLUMN rejection_reason VARCHAR(255) NULL;
    `);

    // Toàn bộ user ĐÃ CÓ trong hệ thống trước migration này (tạo qua Admin,
    // hoặc data seed/production hiện tại) coi như đã duyệt từ trước - default
    // 'approved' ở trên đã lo việc này cho các dòng cũ tự động, không cần
    // UPDATE thêm.

    await queryRunner.query(`
      ALTER TABLE users
      ADD CONSTRAINT FK_users_approved_by
      FOREIGN KEY (approved_by_id) REFERENCES users(id) ON DELETE SET NULL;
    `);

    // Phục vụ lọc nhanh "danh sách tài khoản đang chờ duyệt" ở màn Nhân viên.
    await queryRunner.query(`
      CREATE INDEX idx_users_approval_status ON users(approval_status);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_users_approval_status ON users`);
    await queryRunner.query(`ALTER TABLE users DROP FOREIGN KEY FK_users_approved_by`);
    await queryRunner.query(`
      ALTER TABLE users
      DROP COLUMN approval_status,
      DROP COLUMN approved_by_id,
      DROP COLUMN approved_at,
      DROP COLUMN rejection_reason;
    `);
  }
}
