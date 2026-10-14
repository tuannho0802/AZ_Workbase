import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLAN_RETENTION_SECURITY_ROADMAP — Phase 1: nhật ký các lần chạy job tự động (retention...).
 * Thời gian dùng DATETIME (KHÔNG TIMESTAMP) và luôn được ghi bằng NOW() của DB.
 */
export class CreateCronRuns1786300000000 implements MigrationInterface {
  name = 'CreateCronRuns1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('cron_runs')) return;
    await queryRunner.query(`
      CREATE TABLE \`cron_runs\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`job\` VARCHAR(50) NOT NULL,
        \`target\` VARCHAR(50) NOT NULL,
        \`started_at\` DATETIME NOT NULL,
        \`finished_at\` DATETIME NULL,
        \`status\` VARCHAR(20) NOT NULL,
        \`affected\` INT NOT NULL DEFAULT 0,
        \`message\` TEXT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_cron_runs_job_target\` (\`job\`, \`target\`, \`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('cron_runs')) {
      await queryRunner.query(`DROP TABLE \`cron_runs\``);
    }
  }
}
