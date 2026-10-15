import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * PLAN_RETENTION_SECURITY_ROADMAP — P3.6: `ip_access_logs` (chi tiết từng lượt login/refresh, có giới hạn/IP/giờ) và
 * `ip_access_stats` (tổng hợp mỗi IP, danh sách "Theo dõi IP" đọc từ đây - không COUNT trên bảng log).
 * `outcome` có thêm 'denied' (tài khoản bị khoá/chờ duyệt/bị xoá...) so với plan gốc để không mất lượt nào.
 */
export class CreateIpAccessLogs1786333000000 implements MigrationInterface {
    name = 'CreateIpAccessLogs1786333000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (!(await queryRunner.hasTable('ip_access_logs'))) {
            await queryRunner.query(`
        CREATE TABLE \`ip_access_logs\` (
          \`id\` BIGINT NOT NULL AUTO_INCREMENT,
          \`ip\` VARCHAR(45) NOT NULL,
          \`country_code\` CHAR(2) NULL,
          \`endpoint\` VARCHAR(40) NOT NULL,
          \`outcome\` ENUM('success','wrong_password','unknown_email','account_locked','ip_locked','denied','refresh_ok','refresh_failed') NOT NULL,
          \`ip_status\` ENUM('normal','whitelisted','blocked') NOT NULL DEFAULT 'normal',
          \`user_id\` INT NULL,
          \`email\` VARCHAR(255) NULL,
          \`user_agent\` VARCHAR(255) NULL,
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          KEY \`idx_ip_access_logs_ip_created\` (\`ip\`, \`created_at\`),
          KEY \`idx_ip_access_logs_created\` (\`created_at\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
        }
        if (!(await queryRunner.hasTable('ip_access_stats'))) {
            await queryRunner.query(`
        CREATE TABLE \`ip_access_stats\` (
          \`ip\` VARCHAR(45) NOT NULL,
          \`total_hits\` INT NOT NULL DEFAULT 0,
          \`success_hits\` INT NOT NULL DEFAULT 0,
          \`failed_hits\` INT NOT NULL DEFAULT 0,
          \`blocked_hits\` INT NOT NULL DEFAULT 0,
          \`suppressed_hits\` INT NOT NULL DEFAULT 0,
          \`first_seen_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`last_seen_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`last_outcome\` VARCHAR(20) NULL,
          \`last_country_code\` CHAR(2) NULL,
          \`detail_window_started_at\` DATETIME NULL,
          \`detail_window_count\` INT NOT NULL DEFAULT 0,
          PRIMARY KEY (\`ip\`),
          KEY \`idx_ip_access_stats_last_seen\` (\`last_seen_at\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const t of ['ip_access_logs', 'ip_access_stats']) {
            if (await queryRunner.hasTable(t)) await queryRunner.query(`DROP TABLE \`${t}\``);
        }
    }
}