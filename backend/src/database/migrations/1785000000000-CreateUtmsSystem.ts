import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLAN_UTM_MANAGEMENT - Migration 1/2 (thuần DDL): danh mục UTM + Quản lý phụ + bảng backup + cột customers.utm_id.
 * Dữ liệu cũ được đồng bộ ở migration KẾ TIẾP (BackfillUtmsFromCustomerCampaign1785100000000).
 * Idempotent (hasTable/hasColumn). Thêm index + FK trên `customers` lớn có thể mất thời gian -> chạy giờ ít traffic.
 * `down()` KHÔNG xoá `customer_campaign_backup` (giữ ít nhất 1 chu kỳ phát hành, xem PLAN mục 9.3).
 */
export class CreateUtmsSystem1785000000000 implements MigrationInterface {
  name = 'CreateUtmsSystem1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('utms'))) {
      await queryRunner.query(`
        CREATE TABLE \`utms\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`name\` varchar(100) NOT NULL,
          \`description\` varchar(255) NULL,
          \`color\` varchar(20) NOT NULL DEFAULT '#1677ff',
          \`visibility\` enum('shared','restricted') NOT NULL DEFAULT 'shared',
          \`is_active\` tinyint NOT NULL DEFAULT 1,
          \`primary_manager_id\` int NULL,
          \`created_by_id\` int NULL,
          \`sort_order\` int NOT NULL DEFAULT 0,
          \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_utms_name\` (\`name\`),
          KEY \`IDX_utms_primary_manager\` (\`primary_manager_id\`),
          KEY \`IDX_utms_is_active\` (\`is_active\`),
          CONSTRAINT \`FK_utms_primary_manager\` FOREIGN KEY (\`primary_manager_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`FK_utms_created_by\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    if (!(await queryRunner.hasTable('utm_secondary_managers'))) {
      await queryRunner.query(`
        CREATE TABLE \`utm_secondary_managers\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`utm_id\` int NOT NULL,
          \`user_id\` int NOT NULL,
          \`added_by_id\` int NULL,
          \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_utm_secondary_utm_user\` (\`utm_id\`, \`user_id\`),
          KEY \`IDX_utm_secondary_user\` (\`user_id\`),
          CONSTRAINT \`FK_utm_secondary_utm\` FOREIGN KEY (\`utm_id\`) REFERENCES \`utms\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`FK_utm_secondary_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`FK_utm_secondary_addby\` FOREIGN KEY (\`added_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    // Backup nguyên văn - cố ý KHÔNG có FK tới customers (KH bị xoá cứng không làm mất/khoá backup).
    if (!(await queryRunner.hasTable('customer_campaign_backup'))) {
      await queryRunner.query(`
        CREATE TABLE \`customer_campaign_backup\` (
          \`customer_id\` int NOT NULL,
          \`campaign_raw\` varchar(100) NULL,
          \`utm_id\` int NULL,
          \`backed_up_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`customer_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    if (!(await queryRunner.hasColumn('customers', 'utm_id'))) {
      await queryRunner.query(`
        ALTER TABLE \`customers\`
          ADD COLUMN \`utm_id\` int NULL AFTER \`campaign\`,
          ADD KEY \`IDX_customers_utm_id\` (\`utm_id\`),
          ADD CONSTRAINT \`FK_customers_utm\` FOREIGN KEY (\`utm_id\`) REFERENCES \`utms\` (\`id\`) ON DELETE RESTRICT;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('customers', 'utm_id')) {
      await queryRunner.query(`
        ALTER TABLE \`customers\`
          DROP FOREIGN KEY \`FK_customers_utm\`,
          DROP INDEX \`IDX_customers_utm_id\`,
          DROP COLUMN \`utm_id\`;
      `);
    }
    if (await queryRunner.hasTable('utm_secondary_managers')) {
      await queryRunner.query(`DROP TABLE \`utm_secondary_managers\`;`);
    }
    if (await queryRunner.hasTable('utms')) {
      await queryRunner.query(`DROP TABLE \`utms\`;`);
    }
    // customer_campaign_backup: CỐ Ý giữ lại (xem PLAN 9.3).
  }
}
