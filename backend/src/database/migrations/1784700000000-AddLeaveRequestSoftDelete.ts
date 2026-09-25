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
 * MySQL không hỗ trợ `ADD COLUMN IF NOT EXISTS` - dùng idempotent check qua
 * `findColumnByName()` (đúng pattern `AddWeekStartToLeaveRequests` vừa thêm
 * ở migration liền trước).
 */
export class AddLeaveRequestSoftDelete1784700000000 implements MigrationInterface {
  name = 'AddLeaveRequestSoftDelete1784700000000';

  private readonly table = 'leave_requests';
  private readonly fkName = 'FK_leave_requests_deleted_by';
  private readonly idxName = 'idx_leave_requests_deleted_by_id';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const t = await queryRunner.getTable(this.table);
    if (!t) return;

    if (!t.findColumnByName('deleted_at')) {
      await queryRunner.query(
        `ALTER TABLE \`${this.table}\` ADD COLUMN \`deleted_at\` DATETIME(6) NULL COMMENT 'Thời điểm xoá mềm (vào thùng rác) - NULL nếu đơn chưa bị xoá';`,
      );
    }

    if (!t.findColumnByName('deleted_by_id')) {
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
    const t = await queryRunner.getTable(this.table);
    if (!t) return;

    if (t.findColumnByName('deleted_by_id')) {
      await queryRunner.query(`ALTER TABLE \`${this.table}\` DROP FOREIGN KEY \`${this.fkName}\`;`);
      await queryRunner.query(`DROP INDEX \`${this.idxName}\` ON \`${this.table}\`;`);
      await queryRunner.query(`ALTER TABLE \`${this.table}\` DROP COLUMN \`deleted_by_id\`;`);
    }

    if (t.findColumnByName('deleted_at')) {
      await queryRunner.query(`ALTER TABLE \`${this.table}\` DROP COLUMN \`deleted_at\`;`);
    }
  }
}
