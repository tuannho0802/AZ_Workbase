import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLAN_FANPAGE_ANALYTICS - M2 (GĐ4): số liệu định kỳ nhập tay + số liệu từng bài + mục tiêu tháng + danh mục loại bài.
 *   - `fanpage_metric_snapshots`: 1 dòng / (Page, ngày) - UNIQUE (fanpage_id, snapshot_date) để upsert (X7).
 *   - `fanpage_targets`: mục tiêu follower tăng thêm / tháng (chỉ để báo cáo, KHÔNG kích hoạt nhắc - X8).
 *   - `fanpage_post_types`: danh mục loại bài (dùng ở GĐ6; tạo sẵn để M2 trọn gói như plan).
 *   - `fanpage_posts`: + views/likes/comments/shares, `metrics_updated_at`, `post_type_id` (FK, GĐ6 mới dùng).
 * Chỉ CỘNG THÊM (cột nullable). Idempotent (hasTable/hasColumn). down() đối xứng. KHÔNG sửa migration cũ.
 */
export class CreateFanpageMetrics1786392000000 implements MigrationInterface {
    name = 'CreateFanpageMetrics1786392000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (!(await queryRunner.hasTable('fanpage_metric_snapshots'))) {
            await queryRunner.query(`
        CREATE TABLE \`fanpage_metric_snapshots\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`fanpage_id\` INT NOT NULL,
          \`snapshot_date\` DATE NOT NULL,
          \`followers\` INT UNSIGNED NULL DEFAULT NULL,
          \`reach\` INT UNSIGNED NULL DEFAULT NULL,
          \`engagement\` INT UNSIGNED NULL DEFAULT NULL,
          \`views\` INT UNSIGNED NULL DEFAULT NULL,
          \`note\` VARCHAR(255) NULL DEFAULT NULL,
          \`created_by_id\` INT NULL DEFAULT NULL,
          \`updated_by_id\` INT NULL DEFAULT NULL,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_fanpage_snapshots_page_date\` (\`fanpage_id\`, \`snapshot_date\`),
          INDEX \`IDX_fanpage_snapshots_date\` (\`snapshot_date\`),
          CONSTRAINT \`FK_fanpage_snapshots_page\` FOREIGN KEY (\`fanpage_id\`) REFERENCES \`fanpages\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`FK_fanpage_snapshots_created_by\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`FK_fanpage_snapshots_updated_by\` FOREIGN KEY (\`updated_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
        }

        if (!(await queryRunner.hasTable('fanpage_targets'))) {
            await queryRunner.query(`
        CREATE TABLE \`fanpage_targets\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`fanpage_id\` INT NOT NULL,
          \`month\` CHAR(7) NOT NULL,
          \`target_follower_gain\` INT UNSIGNED NULL DEFAULT NULL,
          \`created_by_id\` INT NULL DEFAULT NULL,
          \`updated_by_id\` INT NULL DEFAULT NULL,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_fanpage_targets_page_month\` (\`fanpage_id\`, \`month\`),
          CONSTRAINT \`FK_fanpage_targets_page\` FOREIGN KEY (\`fanpage_id\`) REFERENCES \`fanpages\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`FK_fanpage_targets_created_by\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`FK_fanpage_targets_updated_by\` FOREIGN KEY (\`updated_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
        }

        if (!(await queryRunner.hasTable('fanpage_post_types'))) {
            await queryRunner.query(`
        CREATE TABLE \`fanpage_post_types\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`name\` VARCHAR(50) NOT NULL,
          \`color\` VARCHAR(20) NOT NULL DEFAULT '#1677ff',
          \`is_locked\` TINYINT NOT NULL DEFAULT 0,
          \`sort_order\` INT NOT NULL DEFAULT 0,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_fanpage_post_types_name\` (\`name\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
        }

        // Cột số liệu từng bài (C4) + loại bài (E5a, dùng ở GĐ6).
        const posts = await queryRunner.getTable('fanpage_posts');
        for (const col of ['views', 'likes', 'comments', 'shares']) {
            if (!posts?.findColumnByName(col)) {
                await queryRunner.query(`ALTER TABLE \`fanpage_posts\` ADD COLUMN \`${col}\` INT UNSIGNED NULL DEFAULT NULL`);
            }
        }
        if (!posts?.findColumnByName('metrics_updated_at')) {
            await queryRunner.query('ALTER TABLE `fanpage_posts` ADD COLUMN `metrics_updated_at` DATETIME(6) NULL DEFAULT NULL');
        }
        if (!posts?.findColumnByName('post_type_id')) {
            await queryRunner.query('ALTER TABLE `fanpage_posts` ADD COLUMN `post_type_id` INT NULL DEFAULT NULL');
        }
        const after = await queryRunner.getTable('fanpage_posts');
        if (!after?.foreignKeys.some((f) => f.name === 'FK_fanpage_posts_post_type')) {
            await queryRunner.query(
                'ALTER TABLE `fanpage_posts` ADD CONSTRAINT `FK_fanpage_posts_post_type` FOREIGN KEY (`post_type_id`) REFERENCES `fanpage_post_types` (`id`) ON DELETE SET NULL',
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const posts = await queryRunner.getTable('fanpage_posts');
        if (posts?.foreignKeys.some((f) => f.name === 'FK_fanpage_posts_post_type')) {
            await queryRunner.query('ALTER TABLE `fanpage_posts` DROP FOREIGN KEY `FK_fanpage_posts_post_type`');
        }
        for (const col of ['post_type_id', 'metrics_updated_at', 'shares', 'comments', 'likes', 'views']) {
            if (posts?.findColumnByName(col)) {
                await queryRunner.query(`ALTER TABLE \`fanpage_posts\` DROP COLUMN \`${col}\``);
            }
        }
        for (const t of ['fanpage_post_types', 'fanpage_targets', 'fanpage_metric_snapshots']) {
            if (await queryRunner.hasTable(t)) {
                await queryRunner.query(`DROP TABLE \`${t}\``);
            }
        }
    }
}