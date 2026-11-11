import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLAN_FANPAGE_ANALYTICS - M1 (GĐ1): nền tảng dữ liệu cho nhịp đăng / tình trạng Page / lưu trữ.
 *   - `fanpages`: + `target_posts_per_week` (TINYINT UNSIGNED NULL), `health_status_id` (FK), `health_note`,
 *     `health_changed_at`, `archived_at` (cùng kiểu `timestamp` như `utms.locked_at`).
 *   - Bảng mới `fanpage_health_statuses` + SEED 5 dòng + BACKFILL mọi Page cũ -> tình trạng mặc định "Bình thường".
 *   - `fanpage_platforms`: + `url_domains` (domain nhận nền tảng từ link). Chỉ UPDATE dòng đang RỖNG, không ghi đè.
 * Chỉ CỘNG THÊM (cột nullable / có default) - code cũ vẫn chạy. Idempotent (hasTable/hasColumn/NOT EXISTS). down() đối xứng.
 */
export class AddFanpageCadenceHealthArchive1786390000000 implements MigrationInterface {
    name = 'AddFanpageCadenceHealthArchive1786390000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1) Danh mục tình trạng Page (tạo TRƯỚC để FK ở `fanpages` trỏ được).
        if (!(await queryRunner.hasTable('fanpage_health_statuses'))) {
            await queryRunner.query(`
        CREATE TABLE \`fanpage_health_statuses\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`name\` VARCHAR(50) NOT NULL,
          \`color\` VARCHAR(20) NOT NULL DEFAULT '#52c41a',
          \`is_blocking\` TINYINT NOT NULL DEFAULT 0,
          \`is_default\` TINYINT NOT NULL DEFAULT 0,
          \`is_locked\` TINYINT NOT NULL DEFAULT 0,
          \`sort_order\` INT NOT NULL DEFAULT 0,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_fanpage_health_statuses_name\` (\`name\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
        }

        // 2) Seed 5 dòng (theo tên - không ghi đè nếu admin đã tự tạo/đổi).
        const seeds: Array<[string, string, number, number, number]> = [
            // [name, color, is_blocking, is_default, sort_order]
            ['Bình thường', '#52c41a', 0, 1, 1],
            ['Bị hạn chế', '#fa8c16', 0, 0, 2],
            ['Checkpoint', '#faad14', 0, 0, 3],
            ['Bị khoá', '#f5222d', 1, 0, 4],
            ['Đã bỏ', '#8c8c8c', 1, 0, 5],
        ];
        for (const [name, color, blocking, isDefault, sort] of seeds) {
            await queryRunner.query(
                `INSERT INTO \`fanpage_health_statuses\` (\`name\`, \`color\`, \`is_blocking\`, \`is_default\`, \`sort_order\`)
         SELECT ?, ?, ?, ?, ? FROM DUAL
         WHERE NOT EXISTS (SELECT 1 FROM \`fanpage_health_statuses\` WHERE \`name\` = ?)`,
                [name, color, blocking, isDefault, sort, name],
            );
        }

        // 3) Cột mới của `fanpages`.
        const pages = await queryRunner.getTable('fanpages');
        if (!pages?.findColumnByName('target_posts_per_week')) {
            await queryRunner.query('ALTER TABLE `fanpages` ADD COLUMN `target_posts_per_week` TINYINT UNSIGNED NULL DEFAULT NULL AFTER `is_active`');
        }
        if (!pages?.findColumnByName('health_status_id')) {
            await queryRunner.query('ALTER TABLE `fanpages` ADD COLUMN `health_status_id` INT NULL DEFAULT NULL AFTER `target_posts_per_week`');
        }
        if (!pages?.findColumnByName('health_note')) {
            await queryRunner.query('ALTER TABLE `fanpages` ADD COLUMN `health_note` VARCHAR(255) NULL DEFAULT NULL AFTER `health_status_id`');
        }
        if (!pages?.findColumnByName('health_changed_at')) {
            await queryRunner.query('ALTER TABLE `fanpages` ADD COLUMN `health_changed_at` TIMESTAMP NULL DEFAULT NULL AFTER `health_note`');
        }
        if (!pages?.findColumnByName('archived_at')) {
            await queryRunner.query('ALTER TABLE `fanpages` ADD COLUMN `archived_at` TIMESTAMP NULL DEFAULT NULL AFTER `health_changed_at`');
        }

        // 4) Index + FK (đọc lại metadata sau khi thêm cột).
        const after = await queryRunner.getTable('fanpages');
        if (!after?.indices.some((i) => i.name === 'IDX_fanpages_health')) {
            await queryRunner.query('CREATE INDEX `IDX_fanpages_health` ON `fanpages` (`health_status_id`)');
        }
        if (!after?.indices.some((i) => i.name === 'IDX_fanpages_archived')) {
            await queryRunner.query('CREATE INDEX `IDX_fanpages_archived` ON `fanpages` (`archived_at`)');
        }
        if (!after?.foreignKeys.some((f) => f.name === 'FK_fanpages_health_status')) {
            await queryRunner.query(
                'ALTER TABLE `fanpages` ADD CONSTRAINT `FK_fanpages_health_status` FOREIGN KEY (`health_status_id`) REFERENCES `fanpage_health_statuses` (`id`) ON DELETE SET NULL',
            );
        }

        // 5) Backfill: mọi Page cũ -> "Bình thường" (dòng is_default). Chỉ Page chưa có tình trạng.
        await queryRunner.query(`
      UPDATE \`fanpages\` SET \`health_status_id\` = (
        SELECT \`id\` FROM \`fanpage_health_statuses\` WHERE \`is_default\` = 1 ORDER BY \`id\` ASC LIMIT 1
      ) WHERE \`health_status_id\` IS NULL
    `);

        // 6) Domain nền tảng - tự nhận nền tảng khi dán link. CHỈ UPDATE dòng đang rỗng.
        const platforms = await queryRunner.getTable('fanpage_platforms');
        if (!platforms?.findColumnByName('url_domains')) {
            await queryRunner.query('ALTER TABLE `fanpage_platforms` ADD COLUMN `url_domains` VARCHAR(255) NULL DEFAULT NULL AFTER `color`');
        }
        const domains: Array<[string, string]> = [
            ['facebook', 'facebook.com,fb.com,fb.watch'],
            ['tiktok', 'tiktok.com'],
            ['instagram', 'instagram.com'],
            ['youtube', 'youtube.com,youtu.be'],
        ];
        for (const [name, list] of domains) {
            await queryRunner.query(
                'UPDATE `fanpage_platforms` SET `url_domains` = ? WHERE LOWER(TRIM(`name`)) = ? AND (`url_domains` IS NULL OR `url_domains` = \'\')',
                [list, name],
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const platforms = await queryRunner.getTable('fanpage_platforms');
        if (platforms?.findColumnByName('url_domains')) {
            await queryRunner.query('ALTER TABLE `fanpage_platforms` DROP COLUMN `url_domains`');
        }

        const pages = await queryRunner.getTable('fanpages');
        if (pages?.foreignKeys.some((f) => f.name === 'FK_fanpages_health_status')) {
            await queryRunner.query('ALTER TABLE `fanpages` DROP FOREIGN KEY `FK_fanpages_health_status`');
        }
        if (pages?.indices.some((i) => i.name === 'IDX_fanpages_health')) {
            await queryRunner.query('DROP INDEX `IDX_fanpages_health` ON `fanpages`');
        }
        if (pages?.indices.some((i) => i.name === 'IDX_fanpages_archived')) {
            await queryRunner.query('DROP INDEX `IDX_fanpages_archived` ON `fanpages`');
        }
        for (const col of ['archived_at', 'health_changed_at', 'health_note', 'health_status_id', 'target_posts_per_week']) {
            if (pages?.findColumnByName(col)) {
                await queryRunner.query(`ALTER TABLE \`fanpages\` DROP COLUMN \`${col}\``);
            }
        }

        if (await queryRunner.hasTable('fanpage_health_statuses')) {
            await queryRunner.query('DROP TABLE `fanpage_health_statuses`');
        }
    }
}