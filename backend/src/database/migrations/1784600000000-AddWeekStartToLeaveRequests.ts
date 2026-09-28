import { MigrationInterface, QueryRunner } from 'typeorm';
import { weekStartSqlFromUtcColumn } from '../../common/utils/week-window.util';

/**
 * Thêm cột GENERATED `week_start` (VIRTUAL) + 2 index cho `leave_requests` để
 * dùng week-mode (`paginateByWeek()`, xem `week-window.util.ts`) ở trang
 * Nghỉ phép (`/nghi-phep`) và Duyệt phép (`/duyet-phep`).
 *
 * Mirror ĐÚNG migration `AddWeekStartGeneratedColumns1784100000000`:
 * - Công thức lấy THẲNG từ `weekStartSqlFromUtcColumn('created_at')` (không
 *   chép tay) - khớp cách FE gom tuần theo ngày TẠO đơn (Thứ 2 -> CN, giờ VN).
 * - VIRTUAL (không STORED) + index phụ - không tốn thêm dung lượng dòng.
 *
 * 2 index đều là COMPOSITE vì mọi truy vấn list đều lọc trước rồi mới gom tuần:
 * - (status, week_start): Duyệt phép - tab Chờ duyệt / Lịch sử lọc theo status.
 * - (requester_id, week_start): Nghỉ phép - chỉ đơn của chính mình.
 *
 * Idempotent (MySQL không có ADD COLUMN/INDEX IF NOT EXISTS): dùng
 * `findColumnByName()` cho cột, `information_schema.STATISTICS` cho index.
 */
export class AddWeekStartToLeaveRequests1784600000000 implements MigrationInterface {
  name = 'AddWeekStartToLeaveRequests1784600000000';

  private readonly table = 'leave_requests';

  private readonly indexes = [
    { name: 'IDX_leave_requests_status_week_start', columns: '`status`, `week_start`' },
    { name: 'IDX_leave_requests_requester_week_start', columns: '`requester_id`, `week_start`' },
  ];

  private async hasIndex(queryRunner: QueryRunner, indexName: string): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT COUNT(1) as cnt FROM information_schema.STATISTICS
       WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
      [this.table, indexName],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const t = await queryRunner.getTable(this.table);
    if (!t) return;

    if (!t.findColumnByName('week_start')) {
      await queryRunner.query(
        `ALTER TABLE \`${this.table}\` ADD COLUMN \`week_start\` CHAR(10) GENERATED ALWAYS AS (${weekStartSqlFromUtcColumn('created_at')}) VIRTUAL COMMENT 'Thứ 2 đầu tuần (YYYY-MM-DD) - cột tính sẵn để đánh index cho week-mode, xem week-window.util.ts';`,
      );
    }

    for (const idx of this.indexes) {
      if (!(await this.hasIndex(queryRunner, idx.name))) {
        await queryRunner.query(`CREATE INDEX \`${idx.name}\` ON \`${this.table}\` (${idx.columns})`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const t = await queryRunner.getTable(this.table);
    if (!t) return;

    // Drop index trước, cột generated sau (MySQL không cho drop cột đang được index tham chiếu).
    for (const idx of this.indexes) {
      if (await this.hasIndex(queryRunner, idx.name)) {
        await queryRunner.query(`DROP INDEX \`${idx.name}\` ON \`${this.table}\``);
      }
    }
    if (t.findColumnByName('week_start')) {
      await queryRunner.query(`ALTER TABLE \`${this.table}\` DROP COLUMN \`week_start\`;`);
    }
  }
}
