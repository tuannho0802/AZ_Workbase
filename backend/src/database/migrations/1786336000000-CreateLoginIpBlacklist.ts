import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * PLAN_RETENTION_SECURITY_ROADMAP — Phase 3.7: blacklist IP đăng nhập (khoá CHỦ ĐỘNG bởi Admin).
 * IP trong bảng này (và chưa hết hạn) bị từ chối đăng nhập/làm mới token NGAY, không chờ chạm ngưỡng khoá bị động.
 * `expires_at = NULL` = vĩnh viễn. Chỉ khớp ĐÚNG 1 địa chỉ (không CIDR). Idempotent bằng hasTable; dùng DATETIME.
 */
export class CreateLoginIpBlacklist1786336000000 implements MigrationInterface {
    name = 'CreateLoginIpBlacklist1786336000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (!(await queryRunner.hasTable('login_ip_blacklist'))) {
            await queryRunner.query(`
        CREATE TABLE \`login_ip_blacklist\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`ip\` VARCHAR(45) NOT NULL,
          \`reason\` VARCHAR(255) NULL,
          \`expires_at\` DATETIME NULL,
          \`created_by\` INT NULL,
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uk_login_ip_blacklist_ip\` (\`ip\`),
          KEY \`idx_login_ip_blacklist_expires\` (\`expires_at\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (await queryRunner.hasTable('login_ip_blacklist')) {
            await queryRunner.query(`DROP TABLE \`login_ip_blacklist\``);
        }
    }
}
