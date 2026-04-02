# Database Management Skill - AZWorkbase

## Skill Purpose
Guide database design, migration management, query optimization, and data integrity for the AZWorkbase MySQL database using TypeORM.

## When to Use This Skill
- Creating database schema or migrations
- Writing complex queries with TypeORM
- Optimizing database performance
- Implementing data relationships
- Setting up indexes and constraints
- Planning backup/restore strategies

## Core Principles

### 1. Database Design Standards

**Naming Conventions (MANDATORY):**
- Table names: `snake_case`, plural (e.g., `customers`, `data_sharing`)
- Column names: `snake_case` (e.g., `sales_user_id`, `created_at`)
- Primary keys: Always `id` (INT AUTO_INCREMENT)
- Foreign keys: `{referenced_table}_id` (e.g., `customer_id`)
- Timestamps: `created_at`, `updated_at`, `deleted_at`
- Indexes: `idx_{column_name}` (e.g., `idx_phone`, `idx_email`)
- Unique constraints: `uk_{column_name}` (e.g., `uk_email`)

**Column Types:**
```sql
-- IDs
id INT PRIMARY KEY AUTO_INCREMENT

-- Strings
name VARCHAR(100) NOT NULL
email VARCHAR(255)
phone VARCHAR(20) NOT NULL
note TEXT

-- Numbers
amount DECIMAL(15,2) NOT NULL  -- For currency
department_id INT NOT NULL

-- Dates
closed_date DATE
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
deleted_at TIMESTAMP NULL  -- For soft deletes

-- Enums
status ENUM('closed', 'pending', 'potential', 'lost')
role ENUM('admin', 'manager', 'assistant', 'employee')
```

### 2. Complete Schema with Relationships

```sql
-- ============================================
-- CORE TABLES
-- ============================================

-- Users Table (Authentication & RBAC)
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

-- Departments Table
CREATE TABLE departments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  manager_user_id INT COMMENT 'Department manager',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_name (name),
  INDEX idx_is_active (is_active),
  
  FOREIGN KEY (manager_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- MARKETING DATA TABLES
-- ============================================

-- Customers Table (Main marketing data)
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
  
  -- Audit fields
  created_by INT NOT NULL,
  updated_by INT,
  deleted_at TIMESTAMP NULL COMMENT 'Soft delete timestamp',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes for performance
  INDEX idx_phone (phone),
  INDEX idx_email (email),
  INDEX idx_source (source),
  INDEX idx_sales_user (sales_user_id),
  INDEX idx_status (status),
  INDEX idx_department (department_id),
  INDEX idx_created_at (created_at),
  INDEX idx_deleted_at (deleted_at),
  INDEX idx_closed_date (closed_date),
  
  -- Composite indexes for common queries
  INDEX idx_sales_status (sales_user_id, status),
  INDEX idx_dept_status (department_id, status),
  
  -- Foreign keys
  FOREIGN KEY (sales_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Deposits Table (FTD History)
CREATE TABLE deposits (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customer_id INT NOT NULL,
  amount DECIMAL(15,2) NOT NULL COMMENT 'Deposit amount in USD',
  deposit_date DATE NOT NULL COMMENT 'Date of deposit',
  broker VARCHAR(100) COMMENT 'Broker where deposit was made',
  transaction_id VARCHAR(100) COMMENT 'Broker transaction reference',
  note TEXT,
  
  -- Audit
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes
  INDEX idx_customer (customer_id),
  INDEX idx_deposit_date (deposit_date),
  INDEX idx_amount (amount),
  
  -- CRITICAL: Composite index for "latest deposit" query
  INDEX idx_customer_date_desc (customer_id, deposit_date DESC),
  
  -- Constraints
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  
  -- Validation
  CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- DATA SHARING TABLES
-- ============================================

-- Data Sharing Permissions
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
  
  -- Prevent duplicate shares
  UNIQUE KEY uk_sharing (customer_id, shared_with_user_id),
  
  -- Indexes
  INDEX idx_customer (customer_id),
  INDEX idx_owner (owner_user_id),
  INDEX idx_shared_with (shared_with_user_id),
  INDEX idx_permission (permission),
  
  -- Foreign keys
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shared_with_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  
  -- Business rule: Cannot share with self
  CHECK (owner_user_id != shared_with_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- SUPPORTING TABLES
-- ============================================

-- Customer Notes
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

-- Audit Logs (Track all changes)
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

-- Campaigns (Future: Track campaign performance)
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

-- Refresh Tokens (JWT)
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
```

### 3. Critical Queries (Pre-optimized)

**Query 1: Get customers with latest FTD (Main table display)**
```sql
-- OPTIMIZED: Uses subquery with INDEX idx_customer_date_desc
SELECT 
  c.id,
  c.name,
  c.phone,
  c.email,
  c.source,
  c.campaign,
  c.status,
  c.broker,
  c.closed_date,
  c.note,
  c.created_at,
  u.name as sales_name,
  d.name as department_name,
  (
    SELECT amount 
    FROM deposits 
    WHERE customer_id = c.id 
    ORDER BY deposit_date DESC 
    LIMIT 1
  ) as latest_ftd
FROM customers c
LEFT JOIN users u ON c.sales_user_id = u.id
LEFT JOIN departments d ON c.department_id = d.id
WHERE c.deleted_at IS NULL
ORDER BY c.created_at DESC
LIMIT 20 OFFSET 0;
```

**Query 2: RBAC - Employee sees only own + shared**
```sql
SELECT c.*
FROM customers c
WHERE c.deleted_at IS NULL
  AND (
    c.created_by = :userId 
    OR c.id IN (
      SELECT customer_id 
      FROM data_sharing 
      WHERE shared_with_user_id = :userId
    )
  )
ORDER BY c.created_at DESC;
```

**Query 3: Check edit permission for shared data**
```sql
SELECT permission
FROM data_sharing
WHERE customer_id = :customerId
  AND shared_with_user_id = :userId
  AND (expires_at IS NULL OR expires_at > NOW());
```

**Query 4: Dashboard stats (Fast aggregation)**
```sql
-- Total customers by status
SELECT 
  status,
  COUNT(*) as count
FROM customers
WHERE deleted_at IS NULL
  AND department_id = :deptId
GROUP BY status;

-- Total FTD by department
SELECT 
  d.name as department,
  SUM(dep.amount) as total_ftd,
  COUNT(DISTINCT dep.customer_id) as unique_customers
FROM deposits dep
JOIN customers c ON dep.customer_id = c.id
JOIN departments d ON c.department_id = d.id
WHERE c.deleted_at IS NULL
GROUP BY d.id, d.name;
```

### 4. TypeORM Entity Relationships

**Example: Customer Entity with Relations**
```typescript
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';

@Entity('customers')
@Index('idx_sales_status', ['salesUserId', 'status'])
@Index('idx_dept_status', ['departmentId', 'status'])
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  @Index('idx_name')
  name: string;

  @Column({ length: 20 })
  @Index('idx_phone')
  phone: string;

  @Column({ length: 255, nullable: true })
  @Index('idx_email')
  email: string;

  @Column({
    type: 'enum',
    enum: ['Facebook', 'TikTok', 'Google', 'Instagram', 'LinkedIn', 'Other'],
  })
  @Index('idx_source')
  source: string;

  @Column({ length: 100, nullable: true })
  campaign: string;

  // Relations
  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'sales_user_id' })
  salesUser: User;

  @Column({ name: 'sales_user_id' })
  @Index('idx_sales_user')
  salesUserId: number;

  @Column({
    type: 'enum',
    enum: ['closed', 'pending', 'potential', 'lost', 'inactive'],
    default: 'pending',
  })
  @Index('idx_status')
  status: string;

  @Column({ length: 100, nullable: true })
  broker: string;

  @Column({ type: 'date', nullable: true })
  @Index('idx_closed_date')
  closedDate: Date;

  @ManyToOne(() => Department)
  @JoinColumn({ name: 'department_id' })
  department: Department;

  @Column({ name: 'department_id' })
  @Index('idx_department')
  departmentId: number;

  @Column({ type: 'text', nullable: true })
  note: string;

  // One-to-Many: Deposits
  @OneToMany(() => Deposit, deposit => deposit.customer)
  deposits: Deposit[];

  // One-to-Many: Shares
  @OneToMany(() => DataSharing, share => share.customer)
  shares: DataSharing[];

  // One-to-Many: Notes
  @OneToMany(() => CustomerNote, note => note.customer)
  notes: CustomerNote[];

  // Audit fields
  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdByUser: User;

  @Column({ name: 'created_by' })
  createdBy: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'updated_by' })
  updatedByUser: User;

  @Column({ name: 'updated_by', nullable: true })
  updatedBy: number;

  @Column({ name: 'deleted_at', nullable: true })
  @Index('idx_deleted_at')
  deletedAt: Date;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  @Index('idx_created_at')
  createdAt: Date;

  @Column({
    name: 'updated_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
```

### 5. Migration Management — QUY TRÌNH BẮT BUỘC

> [!CAUTION]
> **NGHIÊM CẤM sửa Schema bằng TablePlus/GUI từ đây về sau.**
> Mọi thay đổi Schema PHẢI đi qua Migration. Ngoại lệ duy nhất: Sửa data (INSERT/UPDATE/DELETE), không phải cấu trúc bảng.

#### Quy trình 3 bước bắt buộc:

**Bước 1 — Sửa Entity trong Code**
```typescript
// Sửa file: backend/src/database/entities/*.entity.ts
// Ví dụ: Thêm cột mới vào user.entity.ts
@Column({ name: 'new_column', type: 'varchar', nullable: true })
newColumn: string | null;
```

**Bước 2 — Generate Migration (TypeORM tự so sánh Entity vs DB)**
```bash
# Chạy từ thư mục backend/
npm run migration:generate --name=TenMigration
# Ví dụ: npm run migration:generate --name=AddHasedRefreshToken
# File mới sẽ được tạo tại: src/database/migrations/<timestamp>-TenMigration.ts
```

**Bước 3 — Chạy Migration (Áp dụng thay đổi vào DB)**
```bash
npm run migration:run
```

#### Các lệnh quan trọng khác:
```bash
# Xem trạng thái tất cả migration (đã chạy hay chưa)
npm run migration:show

# Rollback migration gần nhất
npm run migration:revert

# Generate với tên cụ thể (Windows)
npm run migration:generate --name=AddHashedRefreshToken
```

#### Danh sách Migration hiện tại (Baseline):
| Timestamp | Tên | Nội dung |
|---|---|---|
| `1700000000000` | `InitialSchema` | Tạo tất cả bảng ban đầu |
| `1710000000000` | `CreateCustomersTable` | Đảm bảo bảng customers tồn tại (IF NOT EXISTS) |
| `1711883300000` | `AddDateFieldsToCustomers` | Thêm `input_date`, `assigned_date` |
| `1743472800000` | `AddHashedRefreshTokenToUsers` | Thêm cột `hashed_refresh_token` (Refresh Token Rotation) |

#### Lưu ý quan trọng khi viết Migration thủ công:
```typescript
// ✅ LUÔN dùng IF NOT EXISTS để an toàn với môi trường đã có:
await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS hashed_refresh_token TEXT NULL`);

// ✅ Luôn viết đủ cả up() và down()
// ✅ Đặt tên file: <timestamp>-<PascalCaseName>.ts
// ❌ KHÔNG bao giờ sửa file migration đã được chạy
```

### 6. Seed Data Script

```typescript
// database/seeds/initial-data.seed.ts
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

export async function seedInitialData(dataSource: DataSource) {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // 1. Insert Departments
    await queryRunner.query(`
      INSERT INTO departments (name, description) VALUES
      ('Sales', 'Sales team'),
      ('Marketing', 'Marketing team'),
      ('Operations', 'Operations team'),
      ('IT', 'IT support team');
    `);

    // 2. Insert Admin User
    const hashedPassword = await bcrypt.hash('Admin@123', 10);
    await queryRunner.query(`
      INSERT INTO users (email, password, name, role, is_active) VALUES
      ('admin@azworkbase.com', '${hashedPassword}', 'System Admin', 'admin', TRUE);
    `);

    // 3. Insert Sample Sales Users
    const salesPassword = await bcrypt.hash('Sales@123', 10);
    await queryRunner.query(`
      INSERT INTO users (email, password, name, role, department_id) VALUES
      ('sales1@azworkbase.com', '${salesPassword}', 'Sales User 1', 'employee', 1),
      ('sales2@azworkbase.com', '${salesPassword}', 'Sales User 2', 'employee', 1),
      ('manager@azworkbase.com', '${salesPassword}', 'Sales Manager', 'manager', 1);
    `);

    // 4. Insert Sample Customers (Optional for testing)
    await queryRunner.query(`
      INSERT INTO customers (name, phone, email, source, sales_user_id, department_id, status, created_by) VALUES
      ('Nguyen Van A', '0901234567', 'nguyenvana@example.com', 'Facebook', 2, 1, 'pending', 2),
      ('Tran Thi B', '0912345678', 'tranthib@example.com', 'TikTok', 3, 1, 'closed', 3),
      ('Le Van C', '0923456789', 'levanc@example.com', 'Google', 2, 1, 'potential', 2);
    `);

    // 5. Insert Sample Deposits
    await queryRunner.query(`
      INSERT INTO deposits (customer_id, amount, deposit_date, created_by) VALUES
      (2, 1000.00, '2024-01-15', 3),
      (2, 2000.00, '2024-01-20', 3);
    `);

    await queryRunner.commitTransaction();
    console.log('✅ Initial data seeded successfully');
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}
```

**Run Seed:**
```bash
npm run seed
```

### 7. Query Optimization Strategies

**Problem: N+1 Query**
```typescript
// ❌ BAD: N+1 queries (1 for customers, N for each customer's deposits)
const customers = await customerRepository.find();
for (const customer of customers) {
  const deposits = await depositRepository.find({ where: { customerId: customer.id } });
  customer.latestDeposit = deposits[0];
}

// ✅ GOOD: Single query with subquery
const customers = await customerRepository
  .createQueryBuilder('customer')
  .select([
    'customer.*',
    '(SELECT amount FROM deposits WHERE customer_id = customer.id ORDER BY deposit_date DESC LIMIT 1) as latest_ftd'
  ])
  .getRawMany();
```

**Problem: Slow Filtering**
```typescript
// ❌ BAD: No index, full table scan
SELECT * FROM customers WHERE name LIKE '%John%';

// ✅ GOOD: Use full-text search or prefix search
-- Add fulltext index:
ALTER TABLE customers ADD FULLTEXT idx_name_fulltext (name);

-- Query with fulltext:
SELECT * FROM customers WHERE MATCH(name) AGAINST('John' IN BOOLEAN MODE);
```

**Problem: Large Result Sets**
```typescript
// ❌ BAD: Fetch all 100,000 customers at once
const customers = await customerRepository.find();

// ✅ GOOD: Use pagination
const [customers, total] = await customerRepository.findAndCount({
  skip: (page - 1) * limit,
  take: limit,
});
```

### 8. Backup & Restore Strategy

**Automated Backup Script (Cron):**
```bash
#!/bin/bash
# /home/azworkbase/backup-db.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/azworkbase/backups/mysql"
DB_NAME="azworkbase_db"
DB_USER="azworkbase_user"
DB_PASS="your_password"

# Create backup directory if not exists
mkdir -p $BACKUP_DIR

# Dump database
mysqldump -u $DB_USER -p$DB_PASS $DB_NAME > $BACKUP_DIR/backup_$DATE.sql

# Compress
gzip $BACKUP_DIR/backup_$DATE.sql

# Delete backups older than 30 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete

echo "Backup completed: backup_$DATE.sql.gz"
```

**Cron Job (Daily at 2 AM):**
```bash
crontab -e

# Add this line:
0 2 * * * /home/azworkbase/backup-db.sh >> /home/azworkbase/backup.log 2>&1
```

**Restore from Backup:**
```bash
gunzip backup_20240115_020000.sql.gz
mysql -u azworkbase_user -p azworkbase_db < backup_20240115_020000.sql
```

### 9. Monitoring & Maintenance

**Slow Query Log:**
```sql
-- Enable slow query log
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 2;  -- Log queries slower than 2 seconds
SET GLOBAL slow_query_log_file = '/var/log/mysql/slow-query.log';
```

**Analyze Query Performance:**
```sql
-- Check if index is used
EXPLAIN SELECT * FROM customers WHERE phone = '0901234567';

-- Check table size
SELECT 
  table_name,
  ROUND(((data_length + index_length) / 1024 / 1024), 2) AS 'Size (MB)'
FROM information_schema.tables
WHERE table_schema = 'azworkbase_db'
ORDER BY (data_length + index_length) DESC;
```

**Optimize Tables (Monthly):**
```sql
OPTIMIZE TABLE customers;
OPTIMIZE TABLE deposits;
OPTIMIZE TABLE audit_logs;
```

### 10. Security Best Practices

**Database User Permissions:**
```sql
-- Create dedicated user (NOT root)
CREATE USER 'azworkbase_user'@'localhost' IDENTIFIED BY 'StrongPassword123!';

-- Grant only necessary privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON azworkbase_db.* TO 'azworkbase_user'@'localhost';

-- Do NOT grant DROP, ALTER in production
FLUSH PRIVILEGES;
```

**Encrypt Sensitive Data:**
```sql
-- For highly sensitive data, use AES encryption
UPDATE customers 
SET phone = AES_ENCRYPT('0901234567', 'encryption_key')
WHERE id = 1;

-- Decrypt when needed
SELECT AES_DECRYPT(phone, 'encryption_key') as phone
FROM customers
WHERE id = 1;
```

**Row-Level Security (RLS) with Views:**
```sql
-- Create view for employee role
CREATE VIEW employee_customers AS
SELECT c.*
FROM customers c
WHERE c.deleted_at IS NULL
  AND (
    c.created_by = (SELECT id FROM users WHERE email = CURRENT_USER())
    OR c.id IN (
      SELECT customer_id FROM data_sharing 
      WHERE shared_with_user_id = (SELECT id FROM users WHERE email = CURRENT_USER())
    )
  );
```

## Critical Checklist

Before Production Deployment:
- [ ] All tables use InnoDB engine
- [ ] All foreign keys have ON DELETE rules (CASCADE, RESTRICT, SET NULL)
- [ ] All frequently queried columns have indexes
- [ ] Composite indexes created for multi-column WHERE clauses
- [ ] All timestamps use TIMESTAMP type (not DATETIME)
- [ ] Soft delete implemented with `deleted_at` (no hard deletes)
- [ ] Audit logs table created and populated
- [ ] Database user has minimal required permissions
- [ ] Backup script tested and automated
- [ ] Slow query log enabled
- [ ] Connection pooling configured (max 20 connections)

## Common Mistakes to Avoid

❌ **NEVER:**
- Use `SELECT *` in production queries
- Create tables without indexes on foreign keys
- Use DATETIME instead of TIMESTAMP (no timezone support)
- Store passwords in plain text
- Grant ALL PRIVILEGES to application user
- Skip migrations (direct schema changes)
- Use synchronize: true in production TypeORM config
- Delete records permanently (use soft delete)

✅ **ALWAYS:**
- Use prepared statements (TypeORM does this automatically)
- Add indexes for columns in WHERE, JOIN, ORDER BY
- Use transactions for multi-table operations
- Validate data before INSERT/UPDATE
- Log all schema changes
- Test migrations on staging before production
- Monitor query performance regularly
- Backup before major changes

## References
- [MySQL Documentation](https://dev.mysql.com/doc/)
- [TypeORM Documentation](https://typeorm.io)
- [Database Indexing Best Practices](https://use-the-index-luke.com)

## 11. Chuẩn hóa Dữ liệu (Boolean Mapping)

MySQL sử dụng `TINYINT(1)` cho kiểu boolean. Để đảm bảo TypeScript nhận đúng giá trị `true/false` từ DB thay vì `0/1`, **bắt buộc** sử dụng `BooleanTransformer`:

```typescript
import { BooleanTransformer } from '../transformers/boolean.transformer';

@Column({ 
  type: 'tinyint', 
  transformer: new BooleanTransformer() 
})
isActive: boolean;
```

## 12. Windows Compatibility (Migration CLI)

Khi chạy lệnh TypeORM CLI trên Windows, không trỏ vào `.bin/typeorm`. Thay vào đó, hãy trỏ trực tiếp vào file logic:

```json
"typeorm:ts": "ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js"
```

---

**Skill Version:** 1.1.0  
**Last Updated:** 2026-04-02