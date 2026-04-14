import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndexesToCustomersTable1776054000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ✅ CRITICAL: Indexes cho sorting/filtering
    await queryRunner.query(`
      CREATE INDEX idx_customers_created_at ON customers(created_at DESC);
    `);
    
    await queryRunner.query(`
      CREATE INDEX idx_customers_status ON customers(status);
    `);
    
    await queryRunner.query(`
      CREATE INDEX idx_customers_source ON customers(source);
    `);
    
    await queryRunner.query(`
      CREATE INDEX idx_customers_sales_user ON customers(sales_user_id);
    `);
    
    await queryRunner.query(`
      CREATE INDEX idx_customers_department ON customers(department_id);
    `);
    
    // Composite index cho query phức tạp
    await queryRunner.query(`
      CREATE INDEX idx_customers_deleted_status 
      ON customers(deleted_at, status);
    `);
    
    console.log('[MIGRATION] Indexes created for customers table');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_customers_created_at ON customers`);
    await queryRunner.query(`DROP INDEX idx_customers_status ON customers`);
    await queryRunner.query(`DROP INDEX idx_customers_source ON customers`);
    await queryRunner.query(`DROP INDEX idx_customers_sales_user ON customers`);
    await queryRunner.query(`DROP INDEX idx_customers_department ON customers`);
    await queryRunner.query(`DROP INDEX idx_customers_deleted_status ON customers`);
  }
}
