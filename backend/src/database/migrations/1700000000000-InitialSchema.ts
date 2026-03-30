import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable strict mode if needed, but not strictly required.
    
    // 1. Create departments table first
    await queryRunner.query(`
      CREATE TABLE departments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        manager_user_id INT COMMENT 'Department manager',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_name (name),
        INDEX idx_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Create users table
    await queryRunner.query(`
      CREATE TABLE users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL COMMENT 'Bcrypt hashed',
        name VARCHAR(100) NOT NULL,
        role ENUM('admin', 'manager', 'assistant', 'employee') NOT NULL DEFAULT 'employee',
        department_id INT,
        is_active BOOLEAN DEFAULT TRUE,
        last_login_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_email (email),
        INDEX idx_role (role),
        INDEX idx_department (department_id),
        INDEX idx_is_active (is_active),
        
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Add manager foreign key to departments
    await queryRunner.query(`
      ALTER TABLE departments
      ADD CONSTRAINT fk_departments_manager
      FOREIGN KEY (manager_user_id) REFERENCES users(id) ON DELETE SET NULL;
    `);

    // 3. Create customers table
    await queryRunner.query(`
      CREATE TABLE customers (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        email VARCHAR(255),
        source ENUM('Facebook', 'TikTok', 'Google', 'Instagram', 'LinkedIn', 'Other') NOT NULL,
        campaign VARCHAR(100) COMMENT 'Campaign name',
        sales_user_id INT NOT NULL COMMENT 'Sales person responsible',
        status ENUM('closed', 'pending', 'potential', 'lost', 'inactive') NOT NULL DEFAULT 'pending',
        broker VARCHAR(100) COMMENT 'Broker platform name',
        closed_date DATE COMMENT 'Date when deal was closed',
        department_id INT NOT NULL,
        note TEXT,
        
        created_by INT NOT NULL,
        updated_by INT,
        deleted_at TIMESTAMP NULL COMMENT 'Soft delete timestamp',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_phone (phone),
        INDEX idx_email (email),
        INDEX idx_source (source),
        INDEX idx_sales_user (sales_user_id),
        INDEX idx_status (status),
        INDEX idx_department (department_id),
        INDEX idx_created_at (created_at),
        INDEX idx_deleted_at (deleted_at),
        INDEX idx_closed_date (closed_date),
        INDEX idx_sales_status (sales_user_id, status),
        INDEX idx_dept_status (department_id, status),
        
        FOREIGN KEY (sales_user_id) REFERENCES users(id) ON DELETE RESTRICT,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Create deposits table
    await queryRunner.query(`
      CREATE TABLE deposits (
        id INT PRIMARY KEY AUTO_INCREMENT,
        customer_id INT NOT NULL,
        amount DECIMAL(15,2) NOT NULL COMMENT 'Deposit amount in USD',
        deposit_date DATE NOT NULL COMMENT 'Date of deposit',
        broker VARCHAR(100) COMMENT 'Broker where deposit was made',
        transaction_id VARCHAR(100) COMMENT 'Broker transaction reference',
        note TEXT,
        
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_customer (customer_id),
        INDEX idx_deposit_date (deposit_date),
        INDEX idx_amount (amount),
        INDEX idx_customer_date_desc (customer_id, deposit_date DESC),
        
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
        
        CHECK (amount > 0)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. Create data_sharing table
    await queryRunner.query(`
      CREATE TABLE data_sharing (
        id INT PRIMARY KEY AUTO_INCREMENT,
        customer_id INT NOT NULL,
        owner_user_id INT NOT NULL COMMENT 'User who owns the data',
        shared_with_user_id INT NOT NULL COMMENT 'User who receives access',
        permission ENUM('view', 'edit') NOT NULL DEFAULT 'view',
        expires_at TIMESTAMP NULL COMMENT 'Optional expiration date',
        
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        UNIQUE KEY uk_sharing (customer_id, shared_with_user_id),
        INDEX idx_customer (customer_id),
        INDEX idx_owner (owner_user_id),
        INDEX idx_shared_with (shared_with_user_id),
        INDEX idx_permission (permission),
        
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (shared_with_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
        
        CHECK (owner_user_id != shared_with_user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. Create customer_notes table
    await queryRunner.query(`
      CREATE TABLE customer_notes (
        id INT PRIMARY KEY AUTO_INCREMENT,
        customer_id INT NOT NULL,
        note TEXT NOT NULL,
        note_type ENUM('general', 'call', 'meeting', 'follow_up') DEFAULT 'general',
        is_important BOOLEAN DEFAULT FALSE,
        
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_customer (customer_id),
        INDEX idx_created_at (created_at),
        INDEX idx_is_important (is_important),
        
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 7. Create audit_logs table
    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        action VARCHAR(50) NOT NULL COMMENT 'create, update, delete, share, login',
        entity_type VARCHAR(50) NOT NULL COMMENT 'customer, deposit, user',
        entity_id INT NOT NULL,
        old_data JSON COMMENT 'Data before change',
        new_data JSON COMMENT 'Data after change',
        ip_address VARCHAR(45) COMMENT 'User IP address',
        user_agent TEXT COMMENT 'Browser user agent',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        INDEX idx_user (user_id),
        INDEX idx_entity (entity_type, entity_id),
        INDEX idx_action (action),
        INDEX idx_created_at (created_at),
        
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 8. Create campaigns table
    await queryRunner.query(`
      CREATE TABLE campaigns (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        source ENUM('Facebook', 'TikTok', 'Google', 'Instagram', 'LinkedIn', 'Other'),
        start_date DATE,
        end_date DATE,
        budget DECIMAL(15,2),
        department_id INT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_name (name),
        INDEX idx_source (source),
        INDEX idx_is_active (is_active),
        
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 9. Create refresh_tokens table
    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        token VARCHAR(500) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        INDEX idx_user (user_id),
        INDEX idx_token (token(100)),
        INDEX idx_expires (expires_at),
        
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse order to respect foreign keys
    await queryRunner.query(`DROP TABLE IF EXISTS refresh_tokens`);
    await queryRunner.query(`DROP TABLE IF EXISTS campaigns`);
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS customer_notes`);
    await queryRunner.query(`DROP TABLE IF EXISTS data_sharing`);
    await queryRunner.query(`DROP TABLE IF EXISTS deposits`);
    await queryRunner.query(`DROP TABLE IF EXISTS customers`);
    await queryRunner.query(`ALTER TABLE departments DROP FOREIGN KEY fk_departments_manager`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
    await queryRunner.query(`DROP TABLE IF EXISTS departments`);
  }
}
