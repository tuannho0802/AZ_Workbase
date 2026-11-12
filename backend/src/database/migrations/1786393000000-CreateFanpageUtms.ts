import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLAN_FANPAGE_ANALYTICS - M3 (GĐ5): liên kết Page ↔ UTM (nhiều-nhiều) + "Page chính" của mỗi UTM (Q1, PLAN 3.7 R1).
 *   - `fanpage_utms` (fanpage_id, utm_id) UNIQUE: không gắn trùng cặp.
 *   - `primary_utm_id`: = `utm_id` nghĩa là Page này là Page CHÍNH (ghi công) của UTM; NULL = Page "tham gia".
 *     UNIQUE(primary_utm_id) + MySQL cho nhiều NULL => DB tự đảm bảo mỗi UTM có TỐI ĐA 1 Page chính (X9).
 *     Không có cột `is_primary` riêng để tránh hai nguồn sự thật.
 *
 * LỆCH SO VỚI PLAN (cố ý): KHÔNG tạo `CHECK (primary_utm_id IS NULL OR primary_utm_id = utm_id)`.
 * MySQL 8 từ chối CHECK tham chiếu cột đang nằm trong FK có hành động tham chiếu (ON DELETE CASCADE) - `utm_id` ở đây
 * chính là trường hợp đó (lỗi ER_CHECK_CONSTRAINT_CLAUSE_USING_FK_REFER_ACTION_COLUMN, 3823). Bất biến
 * `primary_utm_id IS NULL OR = utm_id` được giữ ở service (`FanpageUtmsService` luôn ghi đúng 2 giá trị đó) + có test.
 *
 * Chỉ CỘNG THÊM. Idempotent (hasTable). down() đối xứng. KHÔNG sửa migration cũ. Không tự chạy lên DB thật.
 */
export class CreateFanpageUtms1786393000000 implements MigrationInterface {
    name = 'CreateFanpageUtms1786393000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (await queryRunner.hasTable('fanpage_utms')) return;
        await queryRunner.query(`
      CREATE TABLE \`fanpage_utms\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`fanpage_id\` INT NOT NULL,
        \`utm_id\` INT NOT NULL,
        \`primary_utm_id\` INT NULL DEFAULT NULL,
        \`created_by_id\` INT NULL DEFAULT NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_fanpage_utms_page_utm\` (\`fanpage_id\`, \`utm_id\`),
        UNIQUE KEY \`UQ_fanpage_utms_primary\` (\`primary_utm_id\`),
        INDEX \`IDX_fanpage_utms_utm\` (\`utm_id\`),
        CONSTRAINT \`FK_fanpage_utms_page\` FOREIGN KEY (\`fanpage_id\`) REFERENCES \`fanpages\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_fanpage_utms_utm\` FOREIGN KEY (\`utm_id\`) REFERENCES \`utms\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_fanpage_utms_created_by\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE IF EXISTS `fanpage_utms`');
    }
}