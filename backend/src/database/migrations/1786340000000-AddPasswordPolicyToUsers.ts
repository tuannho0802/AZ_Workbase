import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P6 - Buộc đổi mật khẩu + hạn mật khẩu.
 * - must_change_password: 1 = lần đăng nhập sau BẮT BUỘC đổi (tài khoản do người khác tạo / vừa bị reset).
 * - password_changed_at : lần đặt mật khẩu gần nhất (DATETIME, giờ DB).
 * - password_expires_at : NULL = vô hạn; <= NOW() = hết hạn -> buộc đổi.
 * Người dùng hiện tại giữ must_change = 0, expires = NULL (KHÔNG ép người cũ).
 * Idempotent (hasColumn) vì MySQL không có ADD COLUMN IF NOT EXISTS.
 */
export class AddPasswordPolicyToUsers1786340000000 implements MigrationInterface {
  name = 'AddPasswordPolicyToUsers1786340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('users', 'must_change_password'))) {
      await queryRunner.query(`ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0`);
    }
    if (!(await queryRunner.hasColumn('users', 'password_changed_at'))) {
      await queryRunner.query(`ALTER TABLE users ADD COLUMN password_changed_at DATETIME NULL`);
    }
    if (!(await queryRunner.hasColumn('users', 'password_expires_at'))) {
      await queryRunner.query(`ALTER TABLE users ADD COLUMN password_expires_at DATETIME NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('users', 'password_expires_at')) {
      await queryRunner.query(`ALTER TABLE users DROP COLUMN password_expires_at`);
    }
    if (await queryRunner.hasColumn('users', 'password_changed_at')) {
      await queryRunner.query(`ALTER TABLE users DROP COLUMN password_changed_at`);
    }
    if (await queryRunner.hasColumn('users', 'must_change_password')) {
      await queryRunner.query(`ALTER TABLE users DROP COLUMN must_change_password`);
    }
  }
}
