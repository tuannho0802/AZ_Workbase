import { AppDataSource } from './src/database/data-source';

async function verify() {
  await AppDataSource.initialize();
  const q = AppDataSource.createQueryRunner();

  try {
    const dates = await q.query(`SELECT MIN(YEAR(input_date)) as min_year, MAX(YEAR(input_date)) as max_year FROM customers`);
    console.log('[VERIFY 1] Date Range:', dates);

    const nulls = await q.query(`SELECT COUNT(CASE WHEN phone IS NULL THEN 1 END) as null_phones, COUNT(CASE WHEN email IS NULL THEN 1 END) as null_emails FROM customers`);
    console.log('[VERIFY 2] NULL Counts:', nulls);

    const missing = await q.query(`SELECT COUNT(*) as missing_count FROM customers WHERE phone LIKE 'MISSING_%'`);
    console.log('[VERIFY 3] MISSING_ Prefix (Should be 0):', missing);

    const ftd = await q.query(`SELECT COUNT(*) as deposits FROM deposits WHERE amount > 0`);
    console.log('[VERIFY 4] FTD Deposits:', ftd);

    const total = await q.query(`
      SELECT 
        (SELECT COUNT(*) FROM customers) as customers,
        (SELECT COUNT(*) FROM deposits) as deposits,
        (SELECT COUNT(*) FROM customer_notes) as notes
    `);
    console.log('[VERIFY 5] Total Rows:', total);
  } finally {
    await q.release();
    await AppDataSource.destroy();
  }
}
verify();
