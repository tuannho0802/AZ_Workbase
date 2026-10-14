import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * PLAN_RETENTION_SECURITY_ROADMAP — Phase 3.5: whitelist IP đăng nhập.
 * IP nằm trong bảng này KHÔNG bị khoá theo IP (không đếm sai, không bị `IP_LOCKED`); khoá theo TÀI KHOẢN vẫn áp dụng
 * như thường. Chỉ khớp ĐÚNG 1 địa chỉ (không CIDR). Idempotent bằng hasTable; thời gian dùng DATETIME.
 */
export class CreateLoginIpWhitelist1786331000000 implements MigrationInterface {
    name = 'CreateLoginIpWhitelist1786331000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (!(await queryRunner.hasTable('login_ip_whitelist'))) {
            await queryRunner.query(`
        CREATE TABLE \`login_ip_whitelist\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`ip\` VARCHAR(45) NOT NULL,
          \`note\` VARCHAR(255) NULL,
          \`created_by\` INT NULL,
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uk_login_ip_whitelist_ip\` (\`ip\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (await queryRunner.hasTable('login_ip_whitelist')) {
            await queryRunner.query(`DROP TABLE \`login_ip_whitelist\``);
        }
    }
}