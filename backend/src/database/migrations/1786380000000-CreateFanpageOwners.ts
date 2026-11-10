import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fanpage nhiều người phụ trách: bảng nối `fanpage_owners` (N-N fanpages <-> users).
 * Giữ nguyên cột `fanpages.owner_id` = người phụ trách CHÍNH (phần tử đầu của danh sách) để tương thích ngược.
 * Backfill: mọi Page đang có `owner_id` -> 1 dòng trong bảng nối. Idempotent (hasTable + INSERT IGNORE).
 */
export class CreateFanpageOwners1786380000000 implements MigrationInterface {
    name = 'CreateFanpageOwners1786380000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (!(await queryRunner.hasTable('fanpage_owners'))) {
            await queryRunner.query(`
        CREATE TABLE \`fanpage_owners\` (
          \`fanpage_id\` INT NOT NULL,
          \`user_id\` INT NOT NULL,
          PRIMARY KEY (\`fanpage_id\`, \`user_id\`),
          INDEX \`IDX_fanpage_owners_user\` (\`user_id\`),
          CONSTRAINT \`FK_fanpage_owners_fanpage\` FOREIGN KEY (\`fanpage_id\`) REFERENCES \`fanpages\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`FK_fanpage_owners_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
        }

        await queryRunner.query(`
      INSERT IGNORE INTO \`fanpage_owners\` (\`fanpage_id\`, \`user_id\`)
      SELECT \`id\`, \`owner_id\` FROM \`fanpages\` WHERE \`owner_id\` IS NOT NULL
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (await queryRunner.hasTable('fanpage_owners')) {
            await queryRunner.query('DROP TABLE `fanpage_owners`');
        }
    }
}
