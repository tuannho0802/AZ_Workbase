import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thêm cột `updated_by` vào `customer_notes` - dùng để hiển thị dòng hệ
 * thống "Sửa cuối bởi X" trên UI khi 1 ghi chú được tạo bởi người A nhưng
 * lần sửa gần nhất là do người B (khác A) thực hiện - xem
 * `CustomersService.updateNote()` (luôn set `note.updatedBy = userId` mỗi
 * lần PATCH) và `CustomerNotesTab.tsx` (chỉ hiện dòng này khi
 * `updatedBy !== createdBy`).
 *
 * NULL = ghi chú chưa từng được sửa lần nào kể từ khi tạo. NULLABLE + FK ON
 * DELETE SET NULL, đúng pattern `AddMarketingUserToCustomers` (không muốn
 * mất ghi chú chỉ vì người sửa cuối bị xoá tài khoản).
 */
export class AddUpdatedByToCustomerNotes1779300000000
  implements MigrationInterface
{
  name = 'AddUpdatedByToCustomerNotes1779300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`customer_notes\`
       ADD COLUMN \`updated_by\` INT NULL COMMENT 'Người sửa cuối cùng (khác created_by khi có 2 người cùng chạm vào 1 note)' AFTER \`created_by\``,
    );

    await queryRunner.query(
      `ALTER TABLE \`customer_notes\`
       ADD CONSTRAINT \`FK_customer_notes_updated_by\`
       FOREIGN KEY (\`updated_by\`)
       REFERENCES \`users\`(\`id\`)
       ON DELETE SET NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX \`IDX_customer_notes_updated_by\` ON \`customer_notes\` (\`updated_by\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_customer_notes_updated_by\` ON \`customer_notes\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`customer_notes\`
       DROP FOREIGN KEY \`FK_customer_notes_updated_by\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`customer_notes\`
       DROP COLUMN \`updated_by\``,
    );
  }
}
