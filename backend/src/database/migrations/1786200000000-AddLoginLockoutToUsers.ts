import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Khoá đăng nhập tạm thời: sai mật khẩu 5 lần liên tiếp -> khoá 5 phút.
 * - `failed_login_attempts`: số lần sai liên tiếp (reset về 0 khi đăng nhập đúng).
 * - `locked_until`: DATETIME, so sánh bằng đồng hồ DB (NOW()) ở tầng SQL nên không phụ thuộc timezone của app.
 */
export class AddLoginLockoutToUsers1786200000000 implements MigrationInterface {
  name = 'AddLoginLockoutToUsers1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Idempotent bằng hasColumn (MySQL không hỗ trợ `ADD COLUMN IF NOT EXISTS` - chỉ MariaDB có).
    if (!(await queryRunner.hasColumn('users', 'failed_login_attempts'))) {
      await queryRunner.query(`ALTER TABLE \`users\` ADD COLUMN \`failed_login_attempts\` INT NOT NULL DEFAULT 0`);
    }
    if (!(await queryRunner.hasColumn('users', 'locked_until'))) {
      await queryRunner.query(`ALTER TABLE \`users\` ADD COLUMN \`locked_until\` DATETIME NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('users', 'locked_until')) {
      await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`locked_until\``);
    }
    if (await queryRunner.hasColumn('users', 'failed_login_attempts')) {
      await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`failed_login_attempts\``);
    }
  }
}