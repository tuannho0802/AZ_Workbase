import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * PLAN_RETENTION_SECURITY_ROADMAP — P3.6: 2 cột cấu hình log lượt truy cập IP trong `security_config`:
 * `ip_access_log_retention_days` (90) và `ip_access_detail_cap_per_hour` (20). Idempotent bằng hasColumn.
 */
export class AddIpAccessConfigToSecurityConfig1786334000000 implements MigrationInterface {
    name = 'AddIpAccessConfigToSecurityConfig1786334000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (!(await queryRunner.hasColumn('security_config', 'ip_access_log_retention_days'))) {
            await queryRunner.query(`ALTER TABLE \`security_config\` ADD COLUMN \`ip_access_log_retention_days\` INT NOT NULL DEFAULT 90`);
        }
        if (!(await queryRunner.hasColumn('security_config', 'ip_access_detail_cap_per_hour'))) {
            await queryRunner.query(`ALTER TABLE \`security_config\` ADD COLUMN \`ip_access_detail_cap_per_hour\` INT NOT NULL DEFAULT 20`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (await queryRunner.hasColumn('security_config', 'ip_access_detail_cap_per_hour')) {
            await queryRunner.query(`ALTER TABLE \`security_config\` DROP COLUMN \`ip_access_detail_cap_per_hour\``);
        }
        if (await queryRunner.hasColumn('security_config', 'ip_access_log_retention_days')) {
            await queryRunner.query(`ALTER TABLE \`security_config\` DROP COLUMN \`ip_access_log_retention_days\``);
        }
    }
}