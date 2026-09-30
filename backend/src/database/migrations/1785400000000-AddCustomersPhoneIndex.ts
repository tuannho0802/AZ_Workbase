import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Query "Trùng SĐT" (customers.service.ts, idsQb) chạy subquery tương quan
 * `SELECT MAX(created_at) FROM customers c2 WHERE c2.phone = customer.phone
 * AND c2.deleted_at IS NULL` cho từng dòng khớp. DB dev không còn index nào
 * trên `phone` (SHOW INDEX trả 0 rows) nên mỗi lần subquery quét cả bảng
 * (~1.2s). Index composite (phone, deleted_at, created_at) là covering index
 * cho đúng subquery + điều kiện lọc phone IN (...).
 *
 * Dùng check tồn tại -> an toàn chạy lại trên môi trường đã có index.
 */
export class AddCustomersPhoneIndex1785400000000 implements MigrationInterface {
  name = 'AddCustomersPhoneIndex1785400000000';
  private readonly indexName = 'IDX_customers_phone_deleted_created';

  private async hasIndex(queryRunner: QueryRunner): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT COUNT(1) AS cnt FROM information_schema.STATISTICS
       WHERE table_schema = DATABASE() AND table_name = 'customers' AND index_name = ?`,
      [this.indexName],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await this.hasIndex(queryRunner)) return;
    await queryRunner.query(
      `CREATE INDEX \`${this.indexName}\` ON \`customers\` (\`phone\`, \`deleted_at\`, \`created_at\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.hasIndex(queryRunner))) return;
    await queryRunner.query(`DROP INDEX \`${this.indexName}\` ON \`customers\``);
  }
}
