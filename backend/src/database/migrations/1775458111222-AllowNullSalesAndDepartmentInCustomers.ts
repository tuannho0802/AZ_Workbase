import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowNullSalesAndDepartmentInCustomers1775458111222 implements MigrationInterface {
  name = 'AllowNullSalesAndDepartmentInCustomers1775458111222';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Bước 1: Confirm FK exist (đã check: không tồn tại FK cho sales_user_id và department_id)
    // Do đó không cần DROP FK trước khi ALTER

    // Bước 2: ALTER cột thành NULLABLE
    await queryRunner.query(
      `ALTER TABLE \`customers\` 
       MODIFY COLUMN \`sales_user_id\` INT NULL COMMENT 'Sales person responsible'`
    );
    
    await queryRunner.query(
      `ALTER TABLE \`customers\` 
       MODIFY COLUMN \`department_id\` INT NULL`
    );

    // Bước 3: Tạo Foreign Key mới với ON DELETE SET NULL
    await queryRunner.query(
      `ALTER TABLE \`customers\` 
       ADD CONSTRAINT \`FK_customers_sales_user\` 
       FOREIGN KEY (\`sales_user_id\`) 
       REFERENCES \`users\`(\`id\`) 
       ON DELETE SET NULL`
    );
    
    await queryRunner.query(
      `ALTER TABLE \`customers\` 
       ADD CONSTRAINT \`FK_customers_department\` 
       FOREIGN KEY (\`department_id\`) 
       REFERENCES \`departments\`(\`id\`) 
       ON DELETE SET NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback: đổi lại NOT NULL
    // Bước 1: Drop FK
    await queryRunner.query(
      `ALTER TABLE \`customers\` 
       DROP FOREIGN KEY \`FK_customers_sales_user\``
    );
    await queryRunner.query(
      `ALTER TABLE \`customers\` 
       DROP FOREIGN KEY \`FK_customers_department\``
    );

    // Bước 2: ALTER về NOT NULL
    // ⚠️ Đảm bảo KHÔNG có NULL data trước khi chạy down()
    await queryRunner.query(
      `ALTER TABLE \`customers\` 
       MODIFY COLUMN \`sales_user_id\` INT NOT NULL COMMENT 'Sales person responsible'`
    );
    await queryRunner.query(
      `ALTER TABLE \`customers\` 
       MODIFY COLUMN \`department_id\` INT NOT NULL`
    );

    // Bước 3: Quay về trạng thái ban đầu (không có FK như lúc đầu)
    // Hoặc nếu muốn hoàn hảo thì có thể ADD lại FK nếu trước đó CÓ FK.
    // Nhưng vì ban đầu KHÔNG có FK, nên ở down() chỉ cần drop cái mới ADD ở up() là đủ.
  }
}
