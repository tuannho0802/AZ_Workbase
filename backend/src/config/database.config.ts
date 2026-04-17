// backend/src/config/database.config.ts
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getTypeOrmConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  const isProduction = configService.get<string>('NODE_ENV') === 'production' || configService.get<string>('VERCEL') === '1';

  // Cấu hình cơ bản dùng chung cho cả local và production
  const baseConfig: TypeOrmModuleOptions = {
    type: 'mysql',
    host: configService.get<string>('DB_HOST'),
    port: configService.get<number>('DB_PORT'),
    username: configService.get<string>('DB_USERNAME'),
    password: configService.get<string>('DB_PASSWORD'),
    database: configService.get<string>('DB_DATABASE'),
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    synchronize: false,
    logging: configService.get<string>('NODE_ENV') === 'development',
  };

  // Nếu là môi trường production (Vercel), thêm SSL
  if (isProduction) {
    const sslCert = configService.get<string>('DB_CA_CERT');
    if (sslCert) {
      return {
        ...baseConfig,
        ssl: {
          ca: sslCert, // Dùng chuỗi certificate trực tiếp
        },
        extra: {
          ssl: {
            ca: sslCert,
          },
        },
      };
    } else {
      console.warn('⚠️ Production environment detected but DB_CA_CERT is missing.');
    }
  }

  // Local hoặc không có SSL: trả về base config
  return baseConfig;
};