import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLAN_FANPAGE_ANALYTICS GĐ8 / Patch 2 (M7) - chuẩn bị bỏ công tắc "Theo dõi" (`fanpages.is_active`).
 *   1) Seed Tình trạng "Tạm ngừng" (is_blocking = 1) - idempotent theo tên (không ghi đè nếu admin đã tự tạo).
 *   2) Backfill: Page đang `is_active = 0`, CHƯA lưu trữ và CHƯA có tình trạng chặn -> "Tạm ngừng",
 *      để KPI / nhắc việc / "Hôm nay" KHÔNG đổi kết quả sau khi bỏ cột (không backfill = Page tạm ngừng tự "sống lại").
 * KHÔNG xoá cột `is_active` (việc của M8, sau khi deploy ổn + backup). Chỉ UPDATE dữ liệu -> code cũ vẫn chạy.
 * down(): chỉ trả `is_active = 0` cho các Page đang ở "Tạm ngừng" (không xoá dòng danh mục, tránh mất tham chiếu).
 */
export class SeedFanpagePausedStatusBackfill1786396000000 implements MigrationInterface {
    name = 'SeedFanpagePausedStatusBackfill1786396000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `INSERT INTO \`fanpage_health_statuses\` (\`name\`, \`color\`, \`is_blocking\`, \`is_default\`, \`sort_order\`)
       SELECT 'Tạm ngừng', '#8c8c8c', 1, 0, 6 FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM \`fanpage_health_statuses\` WHERE \`name\` = 'Tạm ngừng')`,
        );

        await queryRunner.query(`
      UPDATE \`fanpages\` f
      SET f.\`health_status_id\` = (SELECT s.\`id\` FROM \`fanpage_health_statuses\` s WHERE s.\`name\` = 'Tạm ngừng' LIMIT 1),
          f.\`health_changed_at\` = NOW()
      WHERE f.\`is_active\` = 0
        AND f.\`archived_at\` IS NULL
        AND (
          f.\`health_status_id\` IS NULL
          OR f.\`health_status_id\` NOT IN (SELECT b.\`id\` FROM \`fanpage_health_statuses\` b WHERE b.\`is_blocking\` = 1)
        )
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      UPDATE \`fanpages\` f
      JOIN \`fanpage_health_statuses\` s ON s.\`id\` = f.\`health_status_id\` AND s.\`name\` = 'Tạm ngừng'
      SET f.\`is_active\` = 0
    `);
    }
}
