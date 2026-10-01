import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

const logger = new Logger('DatabaseConfig');

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
    // Chỉ log lỗi/cảnh báo, không log toàn bộ SQL query để tránh spam log
    logging: ['error', 'warn'],
    maxQueryExecutionTime: 1000, // Log cảnh báo nếu query chạy quá 1s (slow query)

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

    // Production với SSL cert (Aiven yêu cầu) — luôn xác thực chứng chỉ server
    if (sslCert) {
      const ssl = { ca: sslCert, rejectUnauthorized: true };
      return {
        ...baseConfig,
        ssl,
        extra: {
          ssl,
          ...poolConfig,
        },
      };
    }

    // [AGENT] OLD CODE (giữ lại để rollback): production không có cert -> ssl: { rejectUnauthorized: false }
    // [AGENT] NEW CODE: không còn âm thầm tắt xác thực TLS (nguy cơ MITM tới DB).
    // Thiếu DB_CA_CERT => dừng app với thông báo rõ ràng. Chỉ khi chủ động đặt
    // DB_SSL_ALLOW_INSECURE=true mới cho phép kết nối không xác thực (khẩn cấp, tạm thời).
    if (configService.get('DB_SSL_ALLOW_INSECURE') === 'true') {
      logger.warn(
        '[SECURITY] DB_CA_CERT chưa đặt, đang kết nối DB với rejectUnauthorized=false (DB_SSL_ALLOW_INSECURE=true). Hãy đặt DB_CA_CERT càng sớm càng tốt.',
      );
      return {
        ...baseConfig,
        ssl: { rejectUnauthorized: false },
        extra: {
          ssl: { rejectUnauthorized: false },
          ...poolConfig,
        },
      };
    }

    throw new Error(
      'DB_CA_CERT is required in production (TLS verification to the database). Set DB_CA_CERT to the Aiven CA certificate.',
    );
  }

  // Development: không cần SSL
  return {
    ...baseConfig,
    extra: poolConfig,
  };
};