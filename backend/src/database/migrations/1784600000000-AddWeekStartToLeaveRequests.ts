import { MigrationInterface, QueryRunner } from 'typeorm';
import { weekStartSqlFromUtcColumn } from '../../common/utils/week-window.util';

/**
 * Thêm cột GENERATED `week_start` (VIRTUAL) + index cho `leave_requests` -
 * mirror ĐÚNG `AddWeekStartGeneratedColumns1784100000000` (đã áp dụng cho
 * `audit_logs`/`periodic_task_audit_logs`/`attendance_logs`), dùng cho
 * week-mode (`paginateByWeek()`, xem `week-window.util.ts`).
 *
 * YÊU CẦU NGƯỜI DÙNG: "Phân trang cho duyet-phep và 1 trang chỉ chứa 4 tuần
 * ... để sau này data lớn lên không bị Lag" - áp dụng lại ĐÚNG cơ chế
 * week-mode đã có sẵn cho 3 bảng log khác, thay vì tải hết `pending`/
 * `history`/đơn của tôi rồi gộp tuần ở RAM (`WeekGroupedRequests.tsx` cũ) -
 * đây chính là nguyên nhân gây lag khi dữ liệu nhiều lên.
 *
 * `week_start` tính theo `created_at` (ngày TẠO đơn) - khớp đúng cách
 * `WeekGroupedRequests.tsx` cũ đã nhóm tuần (theo `createdAt`, không phải
 * `updatedAt` - xem comment ở component đó và fix bug sort ở `findHistory()`).
 *
 * MySQL không hỗ trợ `ADD COLUMN`/`ADD INDEX IF NOT EXISTS` - dùng lại đúng
 * pattern idempotent (`findColumnByName()` + `information_schema.STATISTICS`)
 * như migration gốc.
 */
export class AddWeekStartToLeaveRequests1784600000000 implements MigrationInterface {
  name = 'AddWeekStartToLeaveRequests1784600000000';

  private readonly table = 'leave_requests';
  private readonly indexName = 'IDX_leave_requests_week_start';

  private async hasIndex(queryRunner: QueryRunner): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT COUNT(1) as cnt FROM information_schema.STATISTICS
       WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
      [this.table, this.indexName],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const t = await queryRunner.getTable(this.table);
    if (!t) return; // an toàn nếu bảng chưa tồn tại ở môi trường đang chạy

    if (!t.findColumnByName('week_start')) {
      const expr = weekStartSqlFromUtcColumn('created_at');
      await queryRunner.query(
        `ALTER TABLE \`${this.table}\` ADD COLUMN \`week_start\` CHAR(10) GENERATED ALWAYS AS (${expr}) VIRTUAL COMMENT 'Thứ 2 đầu tuần (YYYY-MM-DD) theo created_at - cột tính sẵn để đánh index cho week-mode, xem week-window.util.ts';`,
      );
    }

    if (!(await this.hasIndex(queryRunner))) {
      await queryRunner.query(`CREATE INDEX \`${this.indexName}\` ON \`${this.table}\` (\`week_start\`)`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const t = await queryRunner.getTable(this.table);
    if (!t) return;

    if (await this.hasIndex(queryRunner)) {
      await queryRunner.query(`DROP INDEX \`${this.indexName}\` ON \`${this.table}\``);
    }

    if (t.findColumnByName('week_start')) {
      await queryRunner.query(`ALTER TABLE \`${this.table}\` DROP COLUMN \`week_start\`;`);
    }
  }
}
