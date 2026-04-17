import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getTypeOrmConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  const isProduction = configService.get('NODE_ENV') === 'production' || configService.get('VERCEL') === '1';

  const baseConfig: TypeOrmModuleOptions = {
    type: 'mysql',
    host: configService.get('DB_HOST'),
    port: +configService.get('DB_PORT'),
    username: configService.get('DB_USERNAME'),
    password: configService.get('DB_PASSWORD'),
    database: configService.get('DB_DATABASE'),
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    synchronize: false,
    logging: configService.get('NODE_ENV') === 'development',
  };

  // Cấu hình pool chung (áp dụng cho cả production và development)
  const poolConfig = {
    connectionLimit: 10,        // Tối đa 10 connection trong pool
    connectTimeout: 10000,      // Timeout khi thiết lập kết nối mới (10s)
    acquireTimeout: 10000,      // Timeout khi lấy connection từ pool (10s)
    poolPingInterval: 10000,    // Ping database mỗi 10s để giữ kết nối sống
  };

  if (isProduction) {
    const sslCert = configService.get('DB_CA_CERT');
    if (sslCert) {
      return {
        ...baseConfig,
        ssl: { ca: sslCert },
        extra: {
          ssl: { ca: sslCert },
          ...poolConfig,        // Thêm pool config vào extra
        },
      };
    }
  }

  // Môi trường development cũng nên dùng pool để tránh quá tải
  return {
    ...baseConfig,
    extra: poolConfig,
  };
};