import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getTypeOrmConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  const isProduction =
    configService.get('NODE_ENV') === 'production' ||
    configService.get('VERCEL') === '1';

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

    // ✅ Tự retry khi mất kết nối lúc khởi động
    retryAttempts: 5,
    retryDelay: 3000,
    autoLoadEntities: true,
  };

  // Pool config dùng chung cho cả môi trường
  // connectTimeout & acquireTimeout giúp không bị treo khi DB vừa wake up
  const poolConfig = {
    connectionLimit: 3,         // Giảm từ 5 xuống 3 cho Aiven free tier
    connectTimeout: 25000,      // 25s - đủ thời gian để Aiven wake up từ idle
    acquireTimeout: 25000,
    waitForConnections: true,
    queueLimit: 0,

    // ✅ Giữ connection sống - tự ping DB
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000, // Bắt đầu keepAlive sau 30s
  };

  if (isProduction) {
    const sslCert = configService.get('DB_CA_CERT');

    // Production với SSL cert (Aiven yêu cầu)
    if (sslCert) {
      return {
        ...baseConfig,
        ssl: { ca: sslCert },
        extra: {
          ssl: { ca: sslCert },
          ...poolConfig,
        },
      };
    }

    // Production không có cert (fallback, không nên xảy ra)
    return {
      ...baseConfig,
      ssl: { rejectUnauthorized: false },
      extra: {
        ssl: { rejectUnauthorized: false },
        ...poolConfig,
      },
    };
  }

  // Development: không cần SSL
  return {
    ...baseConfig,
    extra: poolConfig,
  };
};