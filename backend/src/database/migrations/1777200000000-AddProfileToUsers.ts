import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProfileToUsers1777200000000 implements MigrationInterface {
  name = 'AddProfileToUsers1777200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('users', 'profile');
    if (!hasColumn) {
      await queryRunner.query(`
        ALTER TABLE \`users\`
        ADD COLUMN \`profile\` json NULL
        COMMENT 'Danh sách link Fanpage/Group user quản lý - [{type,name,url}]. Only Admin CRUD.'
        AFTER \`department_id\`;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('users', 'profile');
    if (hasColumn) {
      await queryRunner.query(`
        ALTER TABLE \`users\` DROP COLUMN \`profile\`;
      `);
    }
  }
}
