import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHashedRefreshTokenToUsers1743472800000 implements MigrationInterface {
  name = 'AddHashedRefreshTokenToUsers1743472800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Thêm cột hashed_refresh_token vào bảng users
    // Lưu ý: Cột này đã được thêm thủ công qua TablePlus.
    // Migration này đảm bảo các môi trường khác (staging, production) cũng có cột này.
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS hashed_refresh_token TEXT NULL DEFAULT NULL
      AFTER last_login_at;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users DROP COLUMN IF EXISTS hashed_refresh_token;
    `);
  }
}
