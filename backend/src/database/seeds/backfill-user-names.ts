import { DataSource } from 'typeorm';
import { User } from '../entities/user.entity';
import { Customer } from '../entities/customer.entity';
import { Deposit } from '../entities/deposit.entity';
import { Department } from '../entities/department.entity';
import { CustomerNote } from '../entities/customer-note.entity';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

async function backfillUserNames() {
  const AppDataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    username: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'az_workbase',
    entities: [User, Customer, Deposit, Department, CustomerNote],
    synchronize: false,
  });

  await AppDataSource.initialize();
  console.log('Database connected for user names backfill');

  const userRepo = AppDataSource.getRepository(User);

  const updates = [
    { id: 1, name: 'Admin' },
    { id: 2, name: 'Sales User 1' },
    { id: 3, name: 'Sales User 2' },
    { id: 4, name: 'Manager' },
    { id: 5, name: 'Manager 2' },
  ];

  for (const u of updates) {
    const user = await userRepo.findOne({ where: { id: u.id } });
    if (user) {
      await userRepo.update(u.id, { name: u.name });
      console.log(`✅ Updated user ID ${u.id} → name: "${u.name}"`);
    } else {
      console.log(`⚠️ User ID ${u.id} not found, skipping.`);
    }
  }

  await AppDataSource.destroy();
  console.log('🎉 Backfill user names hoàn tất!');
}

backfillUserNames().catch(console.error);
