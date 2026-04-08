import { AppDataSource } from './src/database/data-source';
import { Customer } from './src/database/entities/customer.entity';

async function checkDates() {
  await AppDataSource.initialize();
  const customers = await AppDataSource.getRepository(Customer).find({
    where: {},
  });

  const corrupted = customers.filter(c => c.inputDate && c.inputDate.getFullYear() > 2026);
  
  console.log(`Total corrupted records: ${corrupted.length}`);
  corrupted.slice(0, 5).forEach(c => {
    console.log(`ID: ${c.id}, Name: ${c.name}, inputDate: ${c.inputDate.toISOString()}, createdAt: ${c.createdAt.toISOString()}`);
  });

  await AppDataSource.destroy();
}

checkDates();
