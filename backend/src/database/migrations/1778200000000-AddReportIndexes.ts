import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm index phục vụ tính năng "Báo cáo doanh số" (revenue + customer report)
 * - tính ON-DEMAND bằng SQL aggregation (SUM/COUNT + GROUP BY) mỗi lần gọi
 * API, KHÔNG cache kết quả xuống DB (đã cân nhắc kỹ với người dùng: cache
 * đòi invalidate đúng lúc customer đổi status/deposit nhập trễ - rủi ro sai
 * số cao hơn lợi ích tốc độ ở quy mô dữ liệu hiện tại). Index ở đây chính là
 * thứ thay thế cho cache: giữ query tổng hợp đủ nhanh mà không cần lo
 * invalidation.
 *
 * Cột được index, đúng những gì filter/GROUP BY dùng tới:
 * - deposits.deposit_date      -> lọc theo khoảng ngày (tuần/tháng/quý/năm)
 * - customers.closed_date      -> đếm "đã chốt" trong khoảng ngày
 * - customers.department_id    -> GROUP BY theo phòng ban
 * - customers.sales_user_id    -> GROUP BY theo cá nhân (đã có FK nhưng
 *   chưa có index) - dùng cả ở đây lẫn nhiều chỗ khác (customer-access
 *   helper filter theo salesUserId), nên thêm cũng có lợi chung.
 * - customer_group_memberships.joined_at -> đếm "đã join nhóm" trong khoảng ngày
 */
export class AddReportIndexes1778200000000 implements MigrationInterface {
  name = 'AddReportIndexes1778200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const addIndexIfMissing = async (table: string, indexName: string, columns: string[]) => {
      const hasIndex = await queryRunner.query(
        `SELECT COUNT(1) as cnt FROM information_schema.STATISTICS
         WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
        [table, indexName],
      );
      if (Number(hasIndex[0]?.cnt ?? 0) > 0) return;
      await queryRunner.query(
        `CREATE INDEX \`${indexName}\` ON \`${table}\` (${columns.map((c) => `\`${c}\``).join(', ')})`,
      );
    };

    await addIndexIfMissing('deposits', 'IDX_deposits_deposit_date', ['deposit_date']);
    await addIndexIfMissing('customers', 'IDX_customers_closed_date', ['closed_date']);
    await addIndexIfMissing('customers', 'IDX_customers_department_id', ['department_id']);
    await addIndexIfMissing('customers', 'IDX_customers_sales_user_id', ['sales_user_id']);
    await addIndexIfMissing('customer_group_memberships', 'IDX_cgm_joined_at', ['joined_at']);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dropIndexIfExists = async (table: string, indexName: string) => {
      const hasIndex = await queryRunner.query(
        `SELECT COUNT(1) as cnt FROM information_schema.STATISTICS
         WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
        [table, indexName],
      );
      if (Number(hasIndex[0]?.cnt ?? 0) === 0) return;
      await queryRunner.query(`DROP INDEX \`${indexName}\` ON \`${table}\``);
    };

    await dropIndexIfExists('deposits', 'IDX_deposits_deposit_date');
    await dropIndexIfExists('customers', 'IDX_customers_closed_date');
    await dropIndexIfExists('customers', 'IDX_customers_department_id');
    await dropIndexIfExists('customers', 'IDX_customers_sales_user_id');
    await dropIndexIfExists('customer_group_memberships', 'IDX_cgm_joined_at');
  }
}
