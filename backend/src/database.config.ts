import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

// Load environment variables for CLI
dotenv.config({ path: '.env.development' });

export const connectionSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USERNAME ?? 'azworkbase_user',
  password: process.env.DB_PASSWORD ?? 'admin',
  database: process.env.DB_DATABASE ?? 'azworkbase_db',
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: true,
});
