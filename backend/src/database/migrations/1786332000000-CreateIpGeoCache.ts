import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * PLAN_RETENTION_SECURITY_ROADMAP — P3.6: bảng `ip_geo_cache` (IP -> mã quốc gia ISO-3166 alpha-2).
 * Nguồn: header `x-vercel-ip-country` ('vercel'), Admin sửa tay ('manual'), IP mạng nội bộ ('private'). KHÔNG tra cứu ngoài.
 * Idempotent bằng hasTable; thời gian dùng DATETIME.
 */
export class CreateIpGeoCache1786332000000 implements MigrationInterface {
    name = 'CreateIpGeoCache1786332000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (!(await queryRunner.hasTable('ip_geo_cache'))) {
            await queryRunner.query(`
        CREATE TABLE \`ip_geo_cache\` (
          \`ip\` VARCHAR(45) NOT NULL,
          \`country_code\` CHAR(2) NULL,
          \`source\` ENUM('vercel','manual','private','unknown') NOT NULL DEFAULT 'unknown',
          \`resolved_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_by\` INT NULL,
          PRIMARY KEY (\`ip\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (await queryRunner.hasTable('ip_geo_cache')) {
            await queryRunner.query(`DROP TABLE \`ip_geo_cache\``);
        }
    }
}