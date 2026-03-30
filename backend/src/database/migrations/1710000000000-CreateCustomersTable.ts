import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCustomersTable1710000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Dùng IF NOT EXISTS để tương thích an toàn bảo vệ CSDL.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NOT NULL UNIQUE,
        email VARCHAR(255),
        source ENUM('Facebook', 'TikTok', 'Google', 'Instagram', 'LinkedIn', 'Other') NOT NULL,
        campaign VARCHAR(100),
        sales_user_id INT NOT NULL,
        status ENUM('closed', 'pending', 'potential', 'lost', 'inactive') DEFAULT 'pending',
        broker VARCHAR(100),
        closed_date DATE,
        department_id INT NOT NULL,
        note TEXT,
        created_by INT NOT NULL,
        updated_by INT,
        deleted_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_phone (phone),
        INDEX idx_email (email),
        INDEX idx_sales_user (sales_user_id),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at),
        INDEX idx_deleted_at (deleted_at),
        
        CONSTRAINT fk_customers_sales FOREIGN KEY (sales_user_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_customers_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
        CONSTRAINT fk_customers_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS customers`);
  }
}
