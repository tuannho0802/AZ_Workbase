import { MigrationInterface, QueryRunner } from 'typeorm';
import { weekStartSqlFromUtcColumn, weekStartSqlFromNaiveColumn } from '../../common/utils/week-window.util';

/**
 * Thêm cột GENERATED `week_start` (VIRTUAL) + index cho 3 bảng dùng
 * week-mode (`audit_logs`, `periodic_task_audit_logs`, `attendance_logs`) -
 * xem `week-window.util.ts` + `paginateByWeek()`.
 *
 * ⚠️ VÌ SAO CẦN (yêu cầu người dùng: "tối ưu hiệu suất truy vấn"): trước đây
 * `paginateByWeek()` GROUP BY/IN trực tiếp trên biểu thức
 * `DATE_FORMAT(DATE_SUB(DATE(CONVERT_TZ(created_at,...)),...))` - hàm SQL
 * bọc lên đúng cột đã có index (`idx_created_at`/`idx_periodic_task_audit_
 * logs_created_at`/composite `(matchedUserId, recordTime)`) khiến MySQL
 * KHÔNG dùng được index đó cho biểu thức này - phải full scan bảng (đã lọc)
 * mỗi lần tính tuần. Bảng càng lớn, càng chậm - đúng nguyên nhân gốc gây lag
 * ở 3 trang Nhật ký/Lịch sử công việc/Attendance. Cột generated này LƯU SẴN
 * kết quả biểu thức đó, đánh index trực tiếp trên nó -> GROUP BY/WHERE
 * dùng được index seek thay vì scan.
 *
 * Dùng VIRTUAL (không STORED): MySQL/InnoDB vẫn cho phép đánh index phụ
 * (secondary index) trên cột generated VIRTUAL từ 5.7.8 trở lên - không tốn
 * thêm dung lượng lưu full giá trị cột trong mỗi dòng dữ liệu, chỉ bản thân
 * index mới lưu giá trị đã tính.
 *
 * Công thức lấy THẲNG từ `weekStartSqlFromUtcColumn`/
 * `weekStartSqlFromNaiveColumn` (KHÔNG chép tay lại) - đảm bảo tuyệt đối
 * khớp với cách chia tuần đang dùng ở query khác, tránh lệch công thức khi
 * 1 trong 2 nơi bị sửa sau này mà quên sửa nơi kia.
 *
 * MySQL KHÔNG hỗ trợ `ADD COLUMN`/`ADD INDEX IF NOT EXISTS` (đã xác nhận qua
 * các migration khác trong repo, vd `AddColorToRbacGroupingTables`/
 * `AddReportIndexes`) - dùng lại đúng 2 pattern idempotent đã có: `table.
 * findColumnByName()` cho cột, và query `information_schema.STATISTICS`
 * cho index.
 */
export class AddWeekStartGeneratedColumns1784100000000 implements MigrationInterface {
  name = 'AddWeekStartGeneratedColumns1784100000000';

  /** (table, cột nguồn để tính week_start, công thức tương ứng). */
  private readonly targets = [
    { table: 'audit_logs', expr: weekStartSqlFromUtcColumn('created_at') },
    { table: 'periodic_task_audit_logs', expr: weekStartSqlFromUtcColumn('created_at') },
    { table: 'attendance_logs', expr: weekStartSqlFromNaiveColumn('record_time') },
  ];

  private indexName(table: string): string {
    return `IDX_${table}_week_start`;
  }

  private async hasIndex(queryRunner: QueryRunner, table: string, indexName: string): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT COUNT(1) as cnt FROM information_schema.STATISTICS
       WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
      [table, indexName],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { table, expr } of this.targets) {
      const t = await queryRunner.getTable(table);
      if (!t) {
        // An toàn nếu bảng chưa tồn tại ở môi trường đang chạy migration
        // (không nên xảy ra ở prod) - bỏ qua thay vì throw, không chặn các
        // bảng còn lại.
        continue;
      }

      if (!t.findColumnByName('week_start')) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` ADD COLUMN \`week_start\` CHAR(10) GENERATED ALWAYS AS (${expr}) VIRTUAL COMMENT 'Thứ 2 đầu tuần (YYYY-MM-DD) - cột tính sẵn để đánh index cho week-mode, xem week-window.util.ts';`,
        );
      }

      const indexName = this.indexName(table);
      if (!(await this.hasIndex(queryRunner, table, indexName))) {
        await queryRunner.query(`CREATE INDEX \`${indexName}\` ON \`${table}\` (\`week_start\`)`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Thứ tự ngược lại up() - drop index trước, cột generated sau (đúng
    // ràng buộc MySQL: không thể drop cột đang được 1 index tham chiếu).
    for (const { table } of this.targets) {
      const t = await queryRunner.getTable(table);
      if (!t) continue;

      const indexName = this.indexName(table);
      if (await this.hasIndex(queryRunner, table, indexName)) {
        await queryRunner.query(`DROP INDEX \`${indexName}\` ON \`${table}\``);
      }

      if (t.findColumnByName('week_start')) {
        await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN \`week_start\`;`);
      }
    }
  }
}
