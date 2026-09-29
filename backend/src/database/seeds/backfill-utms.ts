import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { backfillUtmsFromCampaign } from '../utils/utm-backfill.util';

dotenv.config({ path: '.env.development' });

/** `npm run utm:backfill` - vá KH phát sinh sau migration (idempotent, có đối soát, rollback nếu sai). */
async function main() {
  const sslConfig = process.env.DB_CA_CERT ? { ca: process.env.DB_CA_CERT } : undefined;
  const ds = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    synchronize: false,
    ...(sslConfig ? { ssl: sslConfig, extra: { ssl: sslConfig } } : {}),
  });
  await ds.initialize();
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    const result = await backfillUtmsFromCampaign(qr);
    await qr.commitTransaction();
    console.log('UTM backfill OK', result);
  } catch (e) {
    await qr.rollbackTransaction();
    console.error('UTM backfill FAILED - đã rollback', e);
    process.exitCode = 1;
  } finally {
    await qr.release();
    await ds.destroy();
  }
}
void main();
