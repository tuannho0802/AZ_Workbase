import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHashedRefreshTokenToUsers1743472800000 implements MigrationInterface {
  name = 'AddHashedRefreshTokenToUsers1743472800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('users', 'hashed_refresh_token');
    if (!hasColumn) {
      await queryRunner.query(`
        ALTER TABLE users
        ADD COLUMN hashed_refresh_token TEXT NULL DEFAULT NULL
        AFTER last_login_at;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('users', 'hashed_refresh_token');
    if (hasColumn) {
      await queryRunner.query(`
        ALTER TABLE users DROP COLUMN hashed_refresh_token;
      `);
    }
  }
}
