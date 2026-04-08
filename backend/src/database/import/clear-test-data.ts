import { AppDataSource } from '../data-source';
import { Customer } from '../entities/customer.entity';
import { CustomerNote } from '../entities/customer-note.entity';
import { Deposit } from '../entities/deposit.entity';

async function clearTestData() {
  try {
    await AppDataSource.initialize();
    console.log('[CLEAR] Database connected');

    console.log('[CLEAR] Deleting test data...');

    // Use query runner to run raw queries for speed and reliability
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    
    try {
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
      
      console.log(' - Deleting deposits...');
      await queryRunner.query('DELETE FROM deposits');
      
      console.log(' - Deleting customer_notes...');
      await queryRunner.query('DELETE FROM customer_notes');
      
      console.log(' - Deleting customers...');
      await queryRunner.query('DELETE FROM customers');
      
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
      console.log('✅ Test data cleared');
    } catch (err) {
      console.error('❌ Error during deletion:', err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  } catch (error) {
    console.error('❌ Clear failed:', error);
    process.exit(1);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

clearTestData()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Clear failed:', err);
    process.exit(1);
  });
