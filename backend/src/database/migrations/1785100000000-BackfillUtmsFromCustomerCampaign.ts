import { MigrationInterface, QueryRunner } from 'typeorm';
import { backfillUtmsFromCampaign } from '../utils/utm-backfill.util';

/**
 * PLAN_UTM_MANAGEMENT - Migration 2/2 (thuần DML): đồng bộ toàn bộ `customers.campaign` cũ -> bảng `utms` + `customers.utm_id`,
 * có backup nguyên văn và đối soát (sai là throw => rollback). Logic ở `utils/utm-backfill.util.ts` (dùng chung với
 * `npm run utm:backfill`). Idempotent. Không đổi `updated_at` của khách hàng.
 * `down()`: khôi phục `campaign` nguyên văn từ backup và gỡ `utm_id` (chỉ các KH có trong backup).
 */
export class BackfillUtmsFromCustomerCampaign1785100000000 implements MigrationInterface {
  name = 'BackfillUtmsFromCustomerCampaign1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await backfillUtmsFromCampaign(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE customers c JOIN customer_campaign_backup b ON b.customer_id = c.id
      SET c.campaign = b.campaign_raw, c.utm_id = NULL, c.updated_at = c.updated_at
    `);
  }
}
