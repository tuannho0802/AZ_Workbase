import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhoneToUsers1777300000000 implements MigrationInterface {
  name = 'AddPhoneToUsers1777300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('users', 'phone');
    if (!hasColumn) {
      await queryRunner.query(`
        ALTER TABLE \`users\`
        ADD COLUMN \`phone\` varchar(20) NULL
        AFTER \`name\`;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('users', 'phone');
    if (hasColumn) {
      await queryRunner.query(`
        ALTER TABLE \`users\` DROP COLUMN \`phone\`;
      `);
    }
  }
}
