import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

export async function seedInitialData(dataSource: DataSource) {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  
  // Bắt đầu transaction để đảm bảo tính toàn vẹn dữ liệu
  await queryRunner.startTransaction();

  try {
    // 1. Chèn dữ liệu mẫu cho các Phòng ban (Departments)
    await queryRunner.query(`
      INSERT INTO departments (name, description) VALUES
      ('Sales', 'Phòng Kinh doanh'),
      ('Marketing', 'Phòng Marketing'),
      ('Operations', 'Phòng Vận hành'),
      ('IT', 'Phòng Hỗ trợ kỹ thuật');
    `);

    // 2. Tạo tài khoản Admin mặc định
    // Mã hóa mật khẩu 'Admin@123' với bcrypt (10 vòng)
    const hashedPassword = await bcrypt.hash('Admin@123', 10);
    await queryRunner.query(`
      INSERT INTO users (email, password, name, role, is_active) VALUES
      ('admin@azworkbase.com', '${hashedPassword}', 'System Admin', 'admin', TRUE);
    `);

    // 3. Tạo các tài khoản Sales mẫu cho kiểm thử
    const salesPassword = await bcrypt.hash('Sales@123', 10);
    await queryRunner.query(`
      INSERT INTO users (email, password, name, role, department_id) VALUES
      ('sales1@azworkbase.com', '${salesPassword}', 'Sales User 1', 'employee', 1),
      ('sales2@azworkbase.com', '${salesPassword}', 'Sales User 2', 'employee', 1),
      ('manager@azworkbase.com', '${salesPassword}', 'Sales Manager', 'manager', 1);
    `);

    // 4. Cập nhật quản lý cho phòng Sales (id = 1)
    await queryRunner.query(`
      UPDATE departments SET manager_user_id = 4 WHERE id = 1;
    `);

    // 5. Chèn dữ liệu mẫu thông tin Khách hàng (Customers)
    await queryRunner.query(`
      INSERT INTO customers (name, phone, email, source, sales_user_id, department_id, status, created_by) VALUES
      ('Nguyen Van A', '0901234567', 'nguyenvana@example.com', 'Facebook', 2, 1, 'pending', 2),
      ('Tran Thi B', '0912345678', 'tranthib@example.com', 'TikTok', 3, 1, 'closed', 3),
      ('Le Van C', '0923456789', 'levanc@example.com', 'Google', 2, 1, 'potential', 2);
    `);

    // 6. Chèn dữ liệu mẫu lịch sử nạp tiền (Deposits - FTD)
    await queryRunner.query(`
      INSERT INTO deposits (customer_id, amount, deposit_date, created_by) VALUES
      (2, 1000.00, '2024-01-15', 3),
      (2, 2000.00, '2024-01-20', 3);
    `);

    // Xác nhận lưu trữ tất cả vào DB sau khi hoàn thành
    await queryRunner.commitTransaction();
    console.log('✅ Khởi tạo dữ liệu mẫu thành công');
  } catch (error) {
    // Hoàn tác mọi thay đổi nếu có lỗi xảy ra
    await queryRunner.rollbackTransaction();
    console.error('❌ Lỗi khởi tạo dữ liệu mẫu:', error);
    throw error;
  } finally {
    // Giải phóng kết nối queryRunner
    await queryRunner.release();
  }
}
