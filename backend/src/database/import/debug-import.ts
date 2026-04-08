import { AppDataSource } from '../data-source';
import { Customer } from '../entities/customer.entity';
import * as fs from 'fs';

async function debugImport() {
  try {
    await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(Customer);
    const customer = repo.create({
      name: 'Debug User',
      phone: 'DEBUG_PHONE_001',
      source: 'Facebook',
      status: 'pending',
      createdBy_OLD: 1,
      inputDate: new Date(),
      departmentId: 1,
      salesUserId: 1,
      createdById: 1,
    } as any);

    await repo.save(customer);
    console.log('✅ Save successful!');
  } catch (error: any) {
    fs.writeFileSync('import_error_debug.json', JSON.stringify(error, null, 2));
    console.error('❌ Save failed. Error details written to import_error_debug.json');
  } finally {
    await AppDataSource.destroy();
  }
}

debugImport();
