import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Module Fanpage (nhân viên tự quản lý Page): 4 bảng + seed danh mục nền tảng.
 *  - fanpage_platforms : danh mục nền tảng (khoá được, không xoá)
 *  - fanpages          : 1 link = 1 Page, thuộc 1 nền tảng + 1 người phụ trách
 *  - fanpage_posts     : bài đăng ghi tay (URL bài + note)
 *  - fanpage_notes     : timeline ghi chú tiến trình Page (mirror customer_notes)
 * Cột thời gian DATETIME(6) khớp mặc định @CreateDateColumn/@UpdateDateColumn. Idempotent (hasTable).
 * Permission seed ở migration kế tiếp (1786371000000).
 */
export class CreateFanpages1786370000000 implements MigrationInterface {
    name = 'CreateFanpages1786370000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const tail = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

        if (!(await queryRunner.hasTable('fanpage_platforms'))) {
            await queryRunner.query(`
        CREATE TABLE \`fanpage_platforms\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`name\` VARCHAR(50) NOT NULL,
          \`color\` VARCHAR(20) NOT NULL DEFAULT '#1677ff',
          \`is_active\` TINYINT NOT NULL DEFAULT 1,
          \`sort_order\` INT NOT NULL DEFAULT 0,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`UQ_fanpage_platforms_name\` (\`name\`)
        ) ${tail}
      `);
        }

        await queryRunner.query(`
      INSERT IGNORE INTO \`fanpage_platforms\` (\`name\`, \`color\`, \`sort_order\`) VALUES
      ('Facebook', '#1877f2', 1),
      ('TikTok', '#262626', 2),
      ('Instagram', '#e1306c', 3),
      ('YouTube', '#ff0000', 4),
      ('Threads', '#595959', 5),
      ('Zalo', '#0068ff', 6),
      ('Telegram', '#229ed9', 7),
      ('Khác', '#8c8c8c', 99)
    `);

        if (!(await queryRunner.hasTable('fanpages'))) {
            await queryRunner.query(`
        CREATE TABLE \`fanpages\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`platform_id\` INT NOT NULL,
          \`name\` VARCHAR(150) NOT NULL,
          \`url\` VARCHAR(500) NOT NULL,
          \`owner_id\` INT NULL DEFAULT NULL,
          \`is_active\` TINYINT NOT NULL DEFAULT 1,
          \`created_by_id\` INT NULL DEFAULT NULL,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`UQ_fanpages_url\` (\`url\`),
          INDEX \`IDX_fanpages_owner\` (\`owner_id\`),
          INDEX \`IDX_fanpages_platform\` (\`platform_id\`),
          CONSTRAINT \`FK_fanpages_platform\` FOREIGN KEY (\`platform_id\`) REFERENCES \`fanpage_platforms\` (\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`FK_fanpages_owner\` FOREIGN KEY (\`owner_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`FK_fanpages_created_by\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
        ) ${tail}
      `);
        }

        if (!(await queryRunner.hasTable('fanpage_posts'))) {
            await queryRunner.query(`
        CREATE TABLE \`fanpage_posts\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`fanpage_id\` INT NOT NULL,
          \`title\` VARCHAR(200) NULL DEFAULT NULL,
          \`url\` VARCHAR(500) NOT NULL,
          \`posted_date\` DATE NULL DEFAULT NULL,
          \`note\` TEXT NULL,
          \`created_by_id\` INT NULL DEFAULT NULL,
          \`updated_by_id\` INT NULL DEFAULT NULL,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          INDEX \`IDX_fanpage_posts_page_date\` (\`fanpage_id\`, \`posted_date\`),
          CONSTRAINT \`FK_fanpage_posts_page\` FOREIGN KEY (\`fanpage_id\`) REFERENCES \`fanpages\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`FK_fanpage_posts_created_by\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`FK_fanpage_posts_updated_by\` FOREIGN KEY (\`updated_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
        ) ${tail}
      `);
        }

        if (!(await queryRunner.hasTable('fanpage_notes'))) {
            await queryRunner.query(`
        CREATE TABLE \`fanpage_notes\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`fanpage_id\` INT NOT NULL,
          \`note\` TEXT NOT NULL,
          \`created_by_id\` INT NULL DEFAULT NULL,
          \`updated_by_id\` INT NULL DEFAULT NULL,
          \`edit_count\` INT NOT NULL DEFAULT 0,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          INDEX \`IDX_fanpage_notes_page_created\` (\`fanpage_id\`, \`created_at\`),
          CONSTRAINT \`FK_fanpage_notes_page\` FOREIGN KEY (\`fanpage_id\`) REFERENCES \`fanpages\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`FK_fanpage_notes_created_by\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`FK_fanpage_notes_updated_by\` FOREIGN KEY (\`updated_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
        ) ${tail}
      `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const t of ['fanpage_notes', 'fanpage_posts', 'fanpages', 'fanpage_platforms']) {
            if (await queryRunner.hasTable(t)) await queryRunner.query(`DROP TABLE \`${t}\``);
        }
    }
}