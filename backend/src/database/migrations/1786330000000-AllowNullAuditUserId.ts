import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLAN_RETENTION_SECURITY_ROADMAP — Phase 4.1: `audit_logs.user_id` cho phép NULL để ghi cả đăng nhập sai với
 * email CHƯA tồn tại (không có user). FK giữ nguyên (`ON DELETE RESTRICT` vẫn hợp lệ với NULL).
 * Idempotent: chỉ đổi khi cột đang NOT NULL. down(): XOÁ các dòng user_id IS NULL (không thể gán user giả) rồi đặt lại NOT NULL.
 */
export class AllowNullAuditUserId1786330000000 implements MigrationInterface {
  name = 'AllowNullAuditUserId1786330000000';

  private async isNullable(queryRunner: QueryRunner): Promise<boolean> {
    const rows: Array<{ n: string }> = await queryRunner.query(
      `SELECT IS_NULLABLE AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs' AND COLUMN_NAME = 'user_id'`,
    );
    return rows[0]?.n === 'YES';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('audit_logs'))) return;
    if (!(await this.isNullable(queryRunner))) {
      await queryRunner.query(`ALTER TABLE \`audit_logs\` MODIFY \`user_id\` INT NULL`);
    }
    // Phục vụ trang /security-activity (lọc theo action + thời gian) mà không quét toàn bảng.
    const idx: Array<{ c: string }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs' AND INDEX_NAME = 'idx_audit_action_created'`,
    );
    if (Number(idx[0]?.c ?? 0) === 0) {
      await queryRunner.query(`CREATE INDEX \`idx_audit_action_created\` ON \`audit_logs\` (\`action\`, \`created_at\`)`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('audit_logs'))) return;
    const idx: Array<{ c: string }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs' AND INDEX_NAME = 'idx_audit_action_created'`,
    );
    if (Number(idx[0]?.c ?? 0) > 0) {
      await queryRunner.query(`DROP INDEX \`idx_audit_action_created\` ON \`audit_logs\``);
    }
    if (await this.isNullable(queryRunner)) {
      await queryRunner.query(`DELETE FROM \`audit_logs\` WHERE \`user_id\` IS NULL`);
      await queryRunner.query(`ALTER TABLE \`audit_logs\` MODIFY \`user_id\` INT NOT NULL`);
    }
  }
}
