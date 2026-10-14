import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLAN_RETENTION_SECURITY_ROADMAP — Phase 3.1: bảng cấu hình bảo mật đăng nhập (1 dòng duy nhất, id = 1),
 * dùng chung cho khoá tài khoản + khoá IP + hạn giữ sự kiện bảo mật (P4).
 * Sửa trực tiếp trong DB được; giá trị ngoài khoảng hợp lệ bị kẹp ở tầng ứng dụng (SecurityConfigService).
 * Idempotent: hasTable + INSERT IGNORE. Thời gian dùng DATETIME.
 */
export class CreateSecurityConfig1786310000000 implements MigrationInterface {
    name = 'CreateSecurityConfig1786310000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (!(await queryRunner.hasTable('security_config'))) {
            await queryRunner.query(`
        CREATE TABLE \`security_config\` (
          \`id\` INT NOT NULL,
          \`account_max_failed_attempts\` INT NOT NULL DEFAULT 5,
          \`account_lock_minutes\` INT NOT NULL DEFAULT 5,
          \`ip_max_failed_attempts\` INT NOT NULL DEFAULT 10,
          \`ip_window_minutes\` INT NOT NULL DEFAULT 10,
          \`ip_lock_minutes\` INT NOT NULL DEFAULT 5,
          \`security_event_retention_days\` INT NOT NULL DEFAULT 180,
          \`updated_by\` INT NULL,
          \`updated_at\` DATETIME NULL,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
        }
        await queryRunner.query(`INSERT IGNORE INTO \`security_config\` (\`id\`) VALUES (1)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (await queryRunner.hasTable('security_config')) {
            await queryRunner.query(`DROP TABLE \`security_config\``);
        }
    }
}