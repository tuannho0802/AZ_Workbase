import { DataSource } from 'typeorm';
import { Customer } from '../entities/customer.entity';
import { Deposit } from '../entities/deposit.entity';
import { User } from '../entities/user.entity';
import { Department } from '../entities/department.entity';
import { CustomerNote } from '../entities/customer-note.entity';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

async function backfill() {
  const AppDataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    username: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'az_workbase',
    entities: [Customer, Deposit, User, Department, CustomerNote],
    synchronize: false,
  });

  await AppDataSource.initialize();
  console.log('Database connected for backfill');

  const customerRepo = AppDataSource.getRepository(Customer);
  const depositRepo = AppDataSource.getRepository(Deposit);
  const userRepo = AppDataSource.getRepository(User);

  // Lấy admin user để dùng làm actor cho data cũ
  const adminUser = await userRepo.findOne({ 
    where: { role: 'admin' } as any
  });
  
  if (!adminUser) {
    console.error('Không tìm thấy admin user!');
    process.exit(1);
  }

  console.log(`Dùng admin: ${adminUser.name} (ID: ${adminUser.id})`);

  // 1. Backfill created_by_id và updated_by_id cho TẤT CẢ customers cũ
  const customerUpdateResult = await customerRepo
    .createQueryBuilder()
    .update()
    .set({ 
      createdById: adminUser.id,
      updatedById: adminUser.id 
    })
    .where('created_by_id IS NULL')
    .execute();
  
  console.log(`✅ Backfill customers: ${customerUpdateResult.affected} records updated`);

  // 2. Backfill created_by_id cho TẤT CẢ deposits cũ
  const depositUpdateResult = await depositRepo
    .createQueryBuilder()
    .update()
    .set({ createdById: adminUser.id })
    .where('created_by_id IS NULL')
    .execute();
  
  console.log(`✅ Backfill deposits: ${depositUpdateResult.affected} records updated`);

  // 3. Cập nhật inputDate của 1 customer thành HÔM NAY để test Modal "Khách hôm nay"
  const firstCustomer = await customerRepo.findOne({ 
    where: {},
    order: { id: 'ASC' }
  });
  
  if (firstCustomer) {
    await customerRepo.update(firstCustomer.id, {
      createdAt: new Date(), // Set createdAt to match the query filter in CustomersService
    });
    console.log(`✅ Set customer "${firstCustomer.name}" createdAt = TODAY để test`);
  }

  await AppDataSource.destroy();
  console.log('🎉 Backfill hoàn tất!');
}

backfill().catch(console.error);
