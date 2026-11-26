import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLAN_FANPAGE_ANALYTICS GĐ8 - số liệu kênh theo KỲ (1 ngày / tuần / tháng / nhiều ngày).
 * Thêm `fanpage_metric_snapshots.period_start` (DATE NULL): ngày đầu của kỳ `views`; NULL = kỳ 1 ngày (= snapshot_date).
 * CHỈ CỘNG THÊM - không xoá/đổi cột cũ (`reach`, `engagement` vẫn còn, entity đã bỏ). Dòng cũ giữ NULL = đúng nghĩa 1 ngày.
 * ⚠️ MySQL (khác MariaDB) KHÔNG hỗ trợ `ADD/DROP COLUMN IF [NOT] EXISTS` -> kiểm tra bằng getTable()/findColumnByName().
 * (Bản đầu dùng `ADD COLUMN IF NOT EXISTS` -> ER_PARSE_ERROR 1064 trên MySQL; chưa từng chạy thành công nên sửa tại chỗ.)
 */
export class AddFanpageSnapshotPeriod1786395000000 implements MigrationInterface {
    name = 'AddFanpageSnapshotPeriod1786395000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable('fanpage_metric_snapshots');
        if (!table?.findColumnByName('period_start')) {
            await queryRunner.query('ALTER TABLE `fanpage_metric_snapshots` ADD COLUMN `period_start` DATE NULL AFTER `snapshot_date`');
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable('fanpage_metric_snapshots');
        if (table?.findColumnByName('period_start')) {
            await queryRunner.query('ALTER TABLE `fanpage_metric_snapshots` DROP COLUMN `period_start`');
        }
    }
}
