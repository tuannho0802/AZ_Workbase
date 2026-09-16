import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * YÊU CẦU NGƯỜI DÙNG: thêm cột "Người Xóa" ở trang Thùng rác khách hàng
 * (`/thung-rac` FE, `GET /customers/trash` BE).
 *
 * `customers.deleted_at` (DeleteDateColumn) đã tồn tại từ trước, nhưng
 * KHÔNG có cột nào lưu AI đã bấm xoá - `CustomersService.remove()` trước đây
 * chỉ gọi `this.customersRepository.softDelete(id)` (TypeORM tự set
 * `deleted_at = NOW()`, không nhận thêm field nào khác qua API này).
 *
 * Thêm `deleted_by_id` đúng theo pattern đã áp dụng cho `users.deleted_by_id`
 * ở migration `AddUserSoftDeleteAndProfilePermissions` (SET NULL nếu chính
 * người xoá sau này cũng bị xoá tài khoản, index riêng cho cột FK, không tạo
 * permission mới vì `customers.trash_manage` đã gác toàn bộ trang này rồi).
 */
export class AddDeletedByToCustomers1783100000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customers
      ADD COLUMN deleted_by_id INT NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE customers
      ADD CONSTRAINT FK_customers_deleted_by
      FOREIGN KEY (deleted_by_id) REFERENCES users(id) ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_customers_deleted_by_id ON customers(deleted_by_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE customers DROP FOREIGN KEY FK_customers_deleted_by`,
    );
    await queryRunner.query(
      `DROP INDEX idx_customers_deleted_by_id ON customers`,
    );
    await queryRunner.query(`
      ALTER TABLE customers
      DROP COLUMN deleted_by_id;
    `);
  }
}
