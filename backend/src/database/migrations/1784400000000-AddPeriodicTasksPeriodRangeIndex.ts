import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `GET /periodic-tasks` giờ LUÔN lọc theo khoảng ngày (mặc định Tuần này - xem
 * `list-window.helper.ts`): `period_end_date >= :from AND period_start_date <= :to`
 * + `ORDER BY period_start_date DESC`. Index đơn `idx_periodic_tasks_period_start_date`
 * chỉ phủ 1 cột; index ghép (start, end) cho phép MySQL lọc biên đầu và biên cuối
 * ngay trên index (không phải đọc từng dòng bảng) khi số Task tăng lớn.
 *
 * MySQL không có `CREATE INDEX IF NOT EXISTS` -> tự kiểm tra information_schema
 * để chạy lại an toàn.
 */
export class AddPeriodicTasksPeriodRangeIndex1784400000000 implements MigrationInterface {
  name = 'AddPeriodicTasksPeriodRangeIndex1784400000000';
  private readonly INDEX_NAME = 'idx_periodic_tasks_period_range';

  private async indexExists(queryRunner: QueryRunner): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT 1 FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = 'periodic_tasks' AND index_name = ? LIMIT 1`,
      [this.INDEX_NAME],
    );
    return rows.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await this.indexExists(queryRunner)) return;
    await queryRunner.query(
      `CREATE INDEX \`${this.INDEX_NAME}\` ON periodic_tasks (period_start_date, period_end_date)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.indexExists(queryRunner))) return;
    await queryRunner.query(`DROP INDEX \`${this.INDEX_NAME}\` ON periodic_tasks`);
  }
}
