import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.development' });

// ⚠️ dotenv.config() KHÔNG ghi đè biến môi trường đã có sẵn trong process.
// Nghĩa là nếu bạn set DB_HOST/DB_PORT/.../DB_CA_CERT thủ công trước khi
// chạy lệnh (VD: chạy migration lên production), các giá trị đó sẽ được
// ưu tiên dùng thay vì giá trị trong .env.development. Không cần sửa gì
// thêm ở đây để "trỏ" sang production.

// Aiven (production) bắt buộc SSL. Local dev (.env.development) không có
// DB_CA_CERT nên nhánh này không kích hoạt -> hành vi dev giữ nguyên 100%.
const sslConfig = process.env.DB_CA_CERT
  ? { ca: process.env.DB_CA_CERT }
  : undefined;

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: true,
  ...(sslConfig ? { ssl: sslConfig, extra: { ssl: sslConfig } } : {}),
});