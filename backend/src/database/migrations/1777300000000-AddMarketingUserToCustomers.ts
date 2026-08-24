import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm cột `marketing_user_id` vào bảng `customers`.
 *
 * Mục đích nghiệp vụ: bên cạnh "Sales phụ trách" (sales_user_id) đã có, cần
 * lưu thêm "Marketing phụ trách" — User (thuộc team Marketing) chịu trách
 * nhiệm chạy/nuôi data cho khách hàng này. Cột này hoàn toàn độc lập với
 * sales_user_id, nullable (không bắt buộc phải gán ngay khi tạo khách hàng),
 * và trỏ tới cùng bảng `users` giống cách sales_user_id đang làm.
 *
 * Theo đúng pattern của AllowNullSalesAndDepartmentInCustomers migration:
 * NULLABLE + FK ON DELETE SET NULL (không muốn mất data khách hàng chỉ vì
 * user Marketing phụ trách bị xoá/khoá).
 */
export class AddMarketingUserToCustomers1777300000000
  implements MigrationInterface
{
  name = 'AddMarketingUserToCustomers1777300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`customers\`
       ADD COLUMN \`marketing_user_id\` INT NULL COMMENT 'Marketing person responsible' AFTER \`sales_user_id\``,
    );

    await queryRunner.query(
      `ALTER TABLE \`customers\`
       ADD CONSTRAINT \`FK_customers_marketing_user\`
       FOREIGN KEY (\`marketing_user_id\`)
       REFERENCES \`users\`(\`id\`)
       ON DELETE SET NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX \`IDX_customers_marketing_user_id\` ON \`customers\` (\`marketing_user_id\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_customers_marketing_user_id\` ON \`customers\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`customers\`
       DROP FOREIGN KEY \`FK_customers_marketing_user\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`customers\`
       DROP COLUMN \`marketing_user_id\``,
    );
  }
}
