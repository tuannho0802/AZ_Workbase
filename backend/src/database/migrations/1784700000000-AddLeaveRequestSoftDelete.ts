import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm Xoá mềm (Thùng rác) cho `leave_requests` - mirror ĐÚNG pattern
 * `customers` (`deleted_at` + `deleted_by_id`, xem `customer.entity.ts` và
 * migration `AddDeletedByToCustomers`), khác 1 điểm: `customers.deleted_at`
 * đã tồn tại từ migration gốc của dự án, còn `leave_requests` CHƯA từng có
 * cột này - migration này thêm CẢ HAI cột cùng lúc.
 *
 * YÊU CẦU NGƯỜI DÙNG: "xoá mềm và xoá thật các đơn nghỉ phép (Phân quyền
 * theo Scope, Mặc định chỉ Admin) và tạo thêm Tab thùng rác trong page
 * duyet-phep" - xem migration `SeedLeaveRequestsDeletePermissions` cho phần
 * permission, `LeaveRequestsService.softDelete()/restoreFromTrash()/
 * hardDelete()` cho phần logic.
 *
 * ⚠️ FIX (phiên này): bản gốc dùng `queryRunner.getTable('leave_requests')`
 * để idempotent-check cột - NHƯNG bảng này đã có cột GENERATED
 * `week_start` từ migration liền trước (`AddWeekStartToLeaveRequests`).
 * TypeORM 0.3 khi introspect (`getTable()`) một bảng có cột GENERATED mà
 * KHÔNG được entity khai `asExpression`, sẽ tự SELECT từ bảng
 * `typeorm_metadata` để lấy lại expression gốc - bảng này CHƯA từng được
 * tạo trong DB thật (chỉ được TypeORM tự tạo nếu có entity khai generated
 * column, mà dự án cố tình KHÔNG khai theo đúng ghi chú ở
 * `notification.entity.ts`) → crash `ER_NO_SUCH_TABLE:
 * az_workbase.typeorm_metadata`. Đây LÀ nguyên nhân lỗi migration thật bạn
 * gặp. Cùng rủi ro này áp dụng cho MỌI migration tương lai gọi `getTable()`
 * trên `audit_logs`/`periodic_task_audit_logs`/`attendance_logs`/
 * `leave_requests` (4 bảng đang có cột `week_start` GENERATED) - từ nay
 * LUÔN dùng raw `information_schema` (như `hasIndex()`/`hasColumn()` dưới
 * đây) thay vì `getTable()` cho các bảng này.
 *
 * MySQL không hỗ trợ `ADD COLUMN IF NOT EXISTS` - dùng idempotent check qua
 * `information_schema.COLUMNS` (KHÔNG dùng `getTable()`/`findColumnByName()`
 * như bản gốc).
 */
export class AddLeaveRequestSoftDelete1784700000000 implements MigrationInterface {
  name = 'AddLeaveRequestSoftDelete1784700000000';

  private readonly table = 'leave_requests';
  private readonly fkName = 'FK_leave_requests_deleted_by';
  private readonly idxName = 'idx_leave_requests_deleted_by_id';

  private async tableExists(queryRunner: QueryRunner): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT COUNT(1) as cnt FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [this.table],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  private async hasColumn(queryRunner: QueryRunner, column: string): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT COUNT(1) as cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [this.table, column],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.tableExists(queryRunner))) return;

    if (!(await this.hasColumn(queryRunner, 'deleted_at'))) {
      await queryRunner.query(
        `ALTER TABLE \`${this.table}\` ADD COLUMN \`deleted_at\` DATETIME(6) NULL COMMENT 'Thời điểm xoá mềm (vào thùng rác) - NULL nếu đơn chưa bị xoá';`,
      );
    }

    if (!(await this.hasColumn(queryRunner, 'deleted_by_id'))) {
      await queryRunner.query(
        `ALTER TABLE \`${this.table}\` ADD COLUMN \`deleted_by_id\` INT NULL COMMENT 'Người đã bấm xoá mềm - hiện ở cột "Người xóa" tab Thùng rác';`,
      );
      await queryRunner.query(
        `ALTER TABLE \`${this.table}\` ADD CONSTRAINT \`${this.fkName}\` FOREIGN KEY (\`deleted_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL;`,
      );
      await queryRunner.query(`CREATE INDEX \`${this.idxName}\` ON \`${this.table}\` (\`deleted_by_id\`);`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.tableExists(queryRunner))) return;

    if (await this.hasColumn(queryRunner, 'deleted_by_id')) {
      await queryRunner.query(`ALTER TABLE \`${this.table}\` DROP FOREIGN KEY \`${this.fkName}\`;`);
      await queryRunner.query(`DROP INDEX \`${this.idxName}\` ON \`${this.table}\`;`);
      await queryRunner.query(`ALTER TABLE \`${this.table}\` DROP COLUMN \`deleted_by_id\`;`);
    }

    if (await this.hasColumn(queryRunner, 'deleted_at')) {
      await queryRunner.query(`ALTER TABLE \`${this.table}\` DROP COLUMN \`deleted_at\`;`);
    }
  }
}