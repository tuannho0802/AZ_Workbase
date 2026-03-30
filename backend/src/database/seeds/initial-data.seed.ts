import { connectionSource } from '../../database.config';
import * as bcrypt from 'bcrypt';

async function runSeed() {
  console.log('🚀 Bắt đầu quá trình nạp dữ liệu mẫu (Seeding)...');

  try {
    // Khởi tạo kết nối
    if (!connectionSource.isInitialized) {
      await connectionSource.initialize();
    }
    console.log('✅ Kết nối cơ sở dữ liệu thành công.');

    const queryRunner = connectionSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    console.log('⏳ Đang xóa dữ liệu cũ để làm sạch (nếu có)...');
    // Drop các bảng theo thứ tự ngược lại để tránh lỗi Foreign Key
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
    await queryRunner.query('TRUNCATE TABLE deposits');
    await queryRunner.query('TRUNCATE TABLE customers');
    await queryRunner.query('TRUNCATE TABLE users');
    await queryRunner.query('TRUNCATE TABLE departments');
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');

    try {
      // 1. Nạp dữ liệu Phòng ban
      console.log('📦 Đang nạp dữ liệu Phòng ban...');
      await queryRunner.query(`
        INSERT INTO departments (id, name, description) VALUES
        (1, 'Sales', 'Phòng Kinh doanh'),
        (2, 'Marketing', 'Phòng Marketing'),
        (3, 'Operations', 'Phòng Vận hành'),
        (4, 'IT', 'Phòng Hỗ trợ kỹ thuật');
      `);

      // 2. Nạp dữ liệu Admin
      console.log('👤 Đang nạp tài khoản Admin...');
      const adminPassword = await bcrypt.hash('Admin@123', 10);
      await queryRunner.query(`
        INSERT INTO users (id, email, password, name, role, is_active) VALUES
        (1, 'admin@azworkbase.com', '${adminPassword}', 'System Admin', 'admin', TRUE);
      `);

      // 3. Nạp dữ liệu Sales
      console.log('👥 Đang nạp tài khoản Sales mẫu...');
      const salesPassword = await bcrypt.hash('Sales@123', 10);
      await queryRunner.query(`
        INSERT INTO users (id, email, password, name, role, department_id) VALUES
        (2, 'sales1@azworkbase.com', '${salesPassword}', 'Sales User 1', 'employee', 1),
        (3, 'sales2@azworkbase.com', '${salesPassword}', 'Sales User 2', 'employee', 1),
        (4, 'manager@azworkbase.com', '${salesPassword}', 'Sales Manager', 'manager', 1);
      `);

      // 4. Cập nhật Manager cho phòng Sales
      console.log('🛠️ Cập nhật quản lý cho phòng ban...');
      await queryRunner.query(`UPDATE departments SET manager_user_id = 4 WHERE id = 1`);

      // 5. Nạp dữ liệu Khách hàng
      console.log('🤝 Đang nạp dữ liệu Khách hàng mẫu...');
      await queryRunner.query(`
        INSERT INTO customers (id, name, phone, email, source, sales_user_id, department_id, status, created_by) VALUES
        (1, 'Nguyen Van A', '0901234567', 'nguyenvana@example.com', 'Facebook', 2, 1, 'pending', 1),
        (2, 'Tran Thi B', '0912345678', 'tranthib@example.com', 'TikTok', 3, 1, 'closed', 1),
        (3, 'Le Van C', '0923456789', 'levanc@example.com', 'Google', 2, 1, 'potential', 1);
      `);

      // 6. Nạp dữ liệu Tiền nạp (Deposits)
      console.log('💰 Đang nạp dữ liệu Giao dịch (Deposits)...');
      await queryRunner.query(`
        INSERT INTO deposits (customer_id, amount, deposit_date, created_by) VALUES
        (2, 1000.00, '2024-01-15', 1),
        (2, 2000.00, '2024-01-20', 1);
      `);

      await queryRunner.commitTransaction();
      console.log('✨ HOÀN TẤT: Dữ liệu mẫu đã được nạp thành công!');
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  } catch (error) {
    console.error('❌ LỖI SEEDING:', error);
    process.exit(1);
  } finally {
    await connectionSource.destroy();
  }
}

runSeed();
