import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLAN_RETENTION_SECURITY_ROADMAP — Phase 3.2: khoá đăng nhập theo IP.
 * - `login_ip_blocks`: 1 dòng / IP (UNIQUE) — bộ đếm sai trong cửa sổ + thời điểm hết khoá. Mọi so sánh thời gian
 *   dùng NOW() của DB (cột DATETIME, không TIMESTAMP) nên không phụ thuộc timezone của app/instance serverless.
 * - `users.last_login_ip`: IP của lần đăng nhập thành công gần nhất (để Admin đối chiếu khi mở khoá).
 */
export class AddLoginIpSecurity1786320000000 implements MigrationInterface {
    name = 'AddLoginIpSecurity1786320000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (!(await queryRunner.hasTable('login_ip_blocks'))) {
            await queryRunner.query(`
        CREATE TABLE \`login_ip_blocks\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`ip\` VARCHAR(45) NOT NULL,
          \`failed_count\` INT NOT NULL DEFAULT 0,
          \`window_started_at\` DATETIME NOT NULL,
          \`blocked_until\` DATETIME NULL,
          \`last_email\` VARCHAR(255) NULL,
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uk_login_ip_blocks_ip\` (\`ip\`),
          INDEX \`idx_login_ip_blocks_updated_at\` (\`updated_at\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
        }
        // Idempotent bằng hasColumn (MySQL không hỗ trợ `ADD COLUMN IF NOT EXISTS`).
        if (!(await queryRunner.hasColumn('users', 'last_login_ip'))) {
            await queryRunner.query(`ALTER TABLE \`users\` ADD COLUMN \`last_login_ip\` VARCHAR(45) NULL`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (await queryRunner.hasColumn('users', 'last_login_ip')) {
            await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`last_login_ip\``);
        }
        if (await queryRunner.hasTable('login_ip_blocks')) {
            await queryRunner.query(`DROP TABLE \`login_ip_blocks\``);
        }
    }
}