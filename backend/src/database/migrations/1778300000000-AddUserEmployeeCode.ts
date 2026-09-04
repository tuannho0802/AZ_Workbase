import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm cột `users.employee_code` - "Mã nhân viên" hiển thị dạng AZ001,
 * AZ002... Mặc định TỰ SINH tăng dần nếu không đặt tay (xem
 * `UsersService.generateNextEmployeeCode()`), nhưng vẫn cho phép admin sửa
 * tay thành mã tuỳ ý (không bắt buộc theo đúng format AZ+số).
 *
 * Thứ tự thực hiện quan trọng (không đảo được):
 *   1) Thêm cột NULLABLE trước (chưa thể NOT NULL ngay vì các user đã có
 *      sẵn trong bảng chưa có giá trị nào cho cột mới).
 *   2) BACKFILL toàn bộ user hiện có bằng `CONCAT('AZ', LPAD(id, 3, '0'))`
 *      - dùng thẳng `id` (đã tăng dần + duy nhất sẵn) làm cơ sở đánh số,
 *      không cần ROW_NUMBER() (tránh phụ thuộc phiên bản MySQL) - số có thể
 *      có "khoảng trống" nếu id không liên tục (do đã từng xoá user), điều
 *      này CHẤP NHẬN ĐƯỢC vì yêu cầu chỉ cần "tăng dần + duy nhất", không
 *      yêu cầu liên tục tuyệt đối.
 *   3) Sau khi backfill xong (không còn NULL), thêm UNIQUE INDEX + đổi
 *      NOT NULL - đảm bảo từ nay về sau không thể trùng/mất mã.
 */
export class AddUserEmployeeCode1778300000000 implements MigrationInterface {
  name = 'AddUserEmployeeCode1778300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('users', 'employee_code');
    if (!hasColumn) {
      await queryRunner.query(`
        ALTER TABLE \`users\`
        ADD COLUMN \`employee_code\` varchar(20) NULL
        COMMENT 'Mã nhân viên hiển thị (vd AZ001) - tự sinh tăng dần nếu không đặt tay'
        AFTER \`id\`;
      `);
    }

    // Backfill - chỉ set cho dòng nào đang NULL (an toàn nếu migration này
    // từng chạy dở dang trước đó rồi bị gián đoạn giữa chừng).
    await queryRunner.query(`
      UPDATE \`users\`
      SET \`employee_code\` = CONCAT('AZ', LPAD(\`id\`, 3, '0'))
      WHERE \`employee_code\` IS NULL;
    `);

    const table = await queryRunner.getTable('users');
    const hasUniqueIndex = table?.indices.some((idx) =>
      idx.columnNames.includes('employee_code'),
    );
    if (!hasUniqueIndex) {
      await queryRunner.query(`
        ALTER TABLE \`users\`
        MODIFY COLUMN \`employee_code\` varchar(20) NOT NULL,
        ADD UNIQUE INDEX \`UQ_users_employee_code\` (\`employee_code\`);
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('users', 'employee_code');
    if (hasColumn) {
      await queryRunner.query(`
        ALTER TABLE \`users\` DROP INDEX \`UQ_users_employee_code\`;
      `).catch(() => {
        // Index có thể chưa từng được tạo (nếu up() bị gián đoạn trước bước
        // cuối) - bỏ qua lỗi "index không tồn tại" khi rollback.
      });
      await queryRunner.query(`
        ALTER TABLE \`users\` DROP COLUMN \`employee_code\`;
      `);
    }
  }
}
