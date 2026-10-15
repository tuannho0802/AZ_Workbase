import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLAN_RETENTION_SECURITY_ROADMAP — P3.6 mục 3.6.2: log request API đã đăng nhập, gom theo thùng 1 phút.
 *
 * - `security_config.ip_access_log_api_enabled` (1 = bật, mặc định bật): công tắc dừng khẩn cấp, tắt không cần deploy.
 * - `ip_access_logs`: thêm `hit_count`, `bucket_minute`, `endpoint_group`, `last_status`; nới `endpoint` 40 -> 80;
 *   thêm giá trị ENUM `api` cho `outcome` (thêm CUỐI danh sách nên MySQL không phải viết lại dữ liệu);
 *   khoá duy nhất `(ip, user_id, endpoint_group, bucket_minute)` cho `INSERT … ON DUPLICATE KEY UPDATE`.
 *   Dòng login/refresh có `bucket_minute = NULL` nên KHÔNG bị ràng buộc (MySQL cho phép nhiều NULL trong khoá duy nhất).
 * - `ip_access_stats`: thêm `api_hits` và cửa sổ cap RIÊNG cho dòng chi tiết request API (`api_window_*`) để dòng API
 *   không bao giờ chiếm chỗ của dòng login/refresh (login thất bại phải luôn thấy được).
 *
 * Idempotent (hasColumn / information_schema), `up()`/`down()` đối xứng. `down()` XOÁ các dòng `outcome = 'api'` trước khi
 * thu hẹp ENUM/cột (không thể giữ lại dữ liệu không còn khớp schema cũ).
 */
export class AddApiHitLoggingToIpAccess1786337000000 implements MigrationInterface {
    name = 'AddApiHitLoggingToIpAccess1786337000000';

    private async columnType(qr: QueryRunner, table: string, column: string): Promise<string | null> {
        const rows: Array<{ t: string }> = await qr.query(
            `SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
            [table, column],
        );
        return rows?.[0]?.t ?? null;
    }

    private async hasIndex(qr: QueryRunner, table: string, index: string): Promise<boolean> {
        const rows: unknown[] = await qr.query(
            `SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
            [table, index],
        );
        return (rows?.length ?? 0) > 0;
    }

    public async up(qr: QueryRunner): Promise<void> {
        if (!(await qr.hasColumn('security_config', 'ip_access_log_api_enabled'))) {
            await qr.query(`ALTER TABLE \`security_config\` ADD COLUMN \`ip_access_log_api_enabled\` INT NOT NULL DEFAULT 1`);
        }

        const statsCols: Array<[string, string]> = [
            ['api_hits', 'INT NOT NULL DEFAULT 0'],
            ['api_window_started_at', 'DATETIME NULL'],
            ['api_window_count', 'INT NOT NULL DEFAULT 0'],
        ];
        for (const [name, def] of statsCols) {
            if (!(await qr.hasColumn('ip_access_stats', name))) {
                await qr.query(`ALTER TABLE \`ip_access_stats\` ADD COLUMN \`${name}\` ${def}`);
            }
        }

        const logCols: Array<[string, string]> = [
            ['hit_count', 'INT NOT NULL DEFAULT 1'],
            ['bucket_minute', 'DATETIME NULL'],
            ['endpoint_group', 'VARCHAR(60) NULL'],
            ['last_status', 'INT NULL'],
        ];
        for (const [name, def] of logCols) {
            if (!(await qr.hasColumn('ip_access_logs', name))) {
                await qr.query(`ALTER TABLE \`ip_access_logs\` ADD COLUMN \`${name}\` ${def}`);
            }
        }

        const endpointType = await this.columnType(qr, 'ip_access_logs', 'endpoint');
        if (endpointType && endpointType.toLowerCase() !== 'varchar(80)') {
            await qr.query(`ALTER TABLE \`ip_access_logs\` MODIFY COLUMN \`endpoint\` VARCHAR(80) NOT NULL`);
        }

        const outcomeType = await this.columnType(qr, 'ip_access_logs', 'outcome');
        if (outcomeType && !outcomeType.includes(`'api'`)) {
            await qr.query(
                `ALTER TABLE \`ip_access_logs\` MODIFY COLUMN \`outcome\`
          ENUM('success','wrong_password','unknown_email','account_locked','ip_locked','denied','refresh_ok','refresh_failed','api') NOT NULL`,
            );
        }

        if (!(await this.hasIndex(qr, 'ip_access_logs', 'uk_ip_access_logs_bucket'))) {
            await qr.query(
                `ALTER TABLE \`ip_access_logs\` ADD UNIQUE KEY \`uk_ip_access_logs_bucket\` (\`ip\`, \`user_id\`, \`endpoint_group\`, \`bucket_minute\`)`,
            );
        }
    }

    public async down(qr: QueryRunner): Promise<void> {
        if (await qr.hasTable('ip_access_logs')) {
            if (await qr.hasColumn('ip_access_logs', 'hit_count')) {
                await qr.query(`DELETE FROM \`ip_access_logs\` WHERE \`outcome\` = 'api'`);
            }
            if (await this.hasIndex(qr, 'ip_access_logs', 'uk_ip_access_logs_bucket')) {
                await qr.query(`ALTER TABLE \`ip_access_logs\` DROP INDEX \`uk_ip_access_logs_bucket\``);
            }
            const outcomeType = await this.columnType(qr, 'ip_access_logs', 'outcome');
            if (outcomeType && outcomeType.includes(`'api'`)) {
                await qr.query(
                    `ALTER TABLE \`ip_access_logs\` MODIFY COLUMN \`outcome\`
            ENUM('success','wrong_password','unknown_email','account_locked','ip_locked','denied','refresh_ok','refresh_failed') NOT NULL`,
                );
            }
            const endpointType = await this.columnType(qr, 'ip_access_logs', 'endpoint');
            if (endpointType && endpointType.toLowerCase() !== 'varchar(40)') {
                await qr.query(`ALTER TABLE \`ip_access_logs\` MODIFY COLUMN \`endpoint\` VARCHAR(40) NOT NULL`);
            }
            for (const name of ['last_status', 'endpoint_group', 'bucket_minute', 'hit_count']) {
                if (await qr.hasColumn('ip_access_logs', name)) {
                    await qr.query(`ALTER TABLE \`ip_access_logs\` DROP COLUMN \`${name}\``);
                }
            }
        }
        for (const name of ['api_window_count', 'api_window_started_at', 'api_hits']) {
            if (await qr.hasColumn('ip_access_stats', name)) {
                await qr.query(`ALTER TABLE \`ip_access_stats\` DROP COLUMN \`${name}\``);
            }
        }
        if (await qr.hasColumn('security_config', 'ip_access_log_api_enabled')) {
            await qr.query(`ALTER TABLE \`security_config\` DROP COLUMN \`ip_access_log_api_enabled\``);
        }
    }
}