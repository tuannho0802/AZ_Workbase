import { connectionSource } from '../../database.config';
import { faker } from '@faker-js/faker';

async function runSeed() {
  console.log('🚀 Bắt đầu quá trình nạp dữ liệu Khách hàng mẫu...');

  try {
    if (!connectionSource.isInitialized) {
      await connectionSource.initialize();
    }
    const queryRunner = connectionSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      console.log('📦 Chuẩn bị 20 Customers...');
      // Phân bổ 5 closed, 10 pending, 5 potential
      const statuses = [
        ...Array(5).fill('closed'),
        ...Array(10).fill('pending'),
        ...Array(5).fill('potential')
      ];
      
      const salesIds = [2, 3]; // Sales1 và Sales2 dựa theo initial-data.seed.ts
      const deptIds = [1, 2]; // Sales, Marketing
      const sources = ['Facebook', 'TikTok', 'Google', 'Instagram', 'Other'];

      for (let i = 0; i < 20; i++) {
        const name = faker.person.fullName();
        const phone = '09' + faker.string.numeric(8);
        const email = faker.internet.email();
        const source = faker.helpers.arrayElement(sources);
        const salesId = faker.helpers.arrayElement(salesIds);
        const status = statuses[i];
        const deptId = faker.helpers.arrayElement(deptIds);
        
        await queryRunner.query(`
          INSERT INTO customers (name, phone, email, source, sales_user_id, status, department_id, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [name, phone, email, source, salesId, status, deptId, 1]); // Admin (1) là người tạo
      }

      await queryRunner.commitTransaction();
      console.log('✨ THÀNH CÔNG: Đã nạp 20 Khách hàng ảo!');
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  } catch (error) {
    console.error('❌ LỖI SEEDING KHÁCH HÀNG:', error);
    process.exit(1);
  } finally {
    if (connectionSource.isInitialized) {
      await connectionSource.destroy();
    }
  }
}

runSeed();
