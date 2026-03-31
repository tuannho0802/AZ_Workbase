import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDateFieldsToCustomers1711883300000 implements MigrationInterface {
    name = 'AddDateFieldsToCustomers1711883300000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Cột 1: Ngày nhập data (mặc định = ngày tạo)
        await queryRunner.query(`ALTER TABLE customers ADD COLUMN input_date DATE NOT NULL DEFAULT (CURRENT_DATE) AFTER updated_by`);
        // Cột 2: Ngày Sales nhận khách
        await queryRunner.query(`ALTER TABLE customers ADD COLUMN assigned_date DATE NULL DEFAULT NULL AFTER input_date`);
        
        // Thêm index để tối ưu filter
        await queryRunner.query(`CREATE INDEX idx_input_date ON customers(input_date)`);
        await queryRunner.query(`CREATE INDEX idx_assigned_date ON customers(assigned_date)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX idx_assigned_date ON customers`);
        await queryRunner.query(`DROP INDEX idx_input_date ON customers`);
        await queryRunner.query(`ALTER TABLE customers DROP COLUMN assigned_date`);
        await queryRunner.query(`ALTER TABLE customers DROP COLUMN input_date`);
    }
}
