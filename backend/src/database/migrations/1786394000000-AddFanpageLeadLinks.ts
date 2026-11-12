import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLAN_FANPAGE_ANALYTICS - M5 (GĐ5b): Lead (khách hàng) nhập từ Page + Ghi chú tiến trình (mục 15).
 *   - `customers.fanpage_id` (NULL, FK SET NULL): Page ghi công TRỰC TIẾP cho khách, ưu tiên hơn UTM (15.3).
 *   - `fanpage_notes.lead_customer_id` (NULL, UNIQUE, FK SET NULL): khách do ghi chú sinh ra; UNIQUE chặn 1 khách gắn nhiều ghi chú.
 *
 * Chỉ CỘNG THÊM, idempotent (hasColumn / information_schema), down() đối xứng. KHÔNG sửa migration cũ. Không tự chạy lên DB thật.
 * Chạy thủ công sau backup, TRƯỚC khi deploy code BE.
 */
export class AddFanpageLeadLinks1786394000000 implements MigrationInterface {
    name = 'AddFanpageLeadLinks1786394000000';

    private async hasIndex(q: QueryRunner, table: string, index: string): Promise<boolean> {
        const rows = await q.query(
            `SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
            [table, index],
        );
        return rows.length > 0;
    }

    private async hasFk(q: QueryRunner, table: string, fk: string): Promise<boolean> {
        const rows = await q.query(
            `SELECT 1 FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ? AND constraint_type = 'FOREIGN KEY' LIMIT 1`,
            [table, fk],
        );
        return rows.length > 0;
    }

    public async up(q: QueryRunner): Promise<void> {
        if (!(await q.hasColumn('customers', 'fanpage_id'))) {
            await q.query('ALTER TABLE `customers` ADD COLUMN `fanpage_id` INT NULL DEFAULT NULL');
        }
        if (!(await this.hasIndex(q, 'customers', 'IDX_customers_fanpage'))) {
            await q.query('ALTER TABLE `customers` ADD INDEX `IDX_customers_fanpage` (`fanpage_id`)');
        }
        if (!(await this.hasFk(q, 'customers', 'FK_customers_fanpage'))) {
            await q.query(
                'ALTER TABLE `customers` ADD CONSTRAINT `FK_customers_fanpage` FOREIGN KEY (`fanpage_id`) REFERENCES `fanpages` (`id`) ON DELETE SET NULL',
            );
        }

        if (!(await q.hasColumn('fanpage_notes', 'lead_customer_id'))) {
            await q.query('ALTER TABLE `fanpage_notes` ADD COLUMN `lead_customer_id` INT NULL DEFAULT NULL');
        }
        if (!(await this.hasIndex(q, 'fanpage_notes', 'UQ_fanpage_notes_lead_customer'))) {
            await q.query('ALTER TABLE `fanpage_notes` ADD UNIQUE INDEX `UQ_fanpage_notes_lead_customer` (`lead_customer_id`)');
        }
        if (!(await this.hasFk(q, 'fanpage_notes', 'FK_fanpage_notes_lead_customer'))) {
            await q.query(
                'ALTER TABLE `fanpage_notes` ADD CONSTRAINT `FK_fanpage_notes_lead_customer` FOREIGN KEY (`lead_customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL',
            );
        }
    }

    public async down(q: QueryRunner): Promise<void> {
        if (await this.hasFk(q, 'fanpage_notes', 'FK_fanpage_notes_lead_customer')) {
            await q.query('ALTER TABLE `fanpage_notes` DROP FOREIGN KEY `FK_fanpage_notes_lead_customer`');
        }
        if (await this.hasIndex(q, 'fanpage_notes', 'UQ_fanpage_notes_lead_customer')) {
            await q.query('ALTER TABLE `fanpage_notes` DROP INDEX `UQ_fanpage_notes_lead_customer`');
        }
        if (await q.hasColumn('fanpage_notes', 'lead_customer_id')) {
            await q.query('ALTER TABLE `fanpage_notes` DROP COLUMN `lead_customer_id`');
        }
        if (await this.hasFk(q, 'customers', 'FK_customers_fanpage')) {
            await q.query('ALTER TABLE `customers` DROP FOREIGN KEY `FK_customers_fanpage`');
        }
        if (await this.hasIndex(q, 'customers', 'IDX_customers_fanpage')) {
            await q.query('ALTER TABLE `customers` DROP INDEX `IDX_customers_fanpage`');
        }
        if (await q.hasColumn('customers', 'fanpage_id')) {
            await q.query('ALTER TABLE `customers` DROP COLUMN `fanpage_id`');
        }
    }
}
