import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getTypeOrmConfig } from './config/database.config';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { DepositsModule } from './modules/deposits/deposits.module';
import { LeaveRequestsModule } from './modules/leave-requests/leave-requests.module';
import { AuditModule } from './modules/audit/audit.module';
import { ZkDeviceModule } from './modules/zk-device/zk-device.module';
import { AttendanceExportModule } from './modules/attendance-export/attendance-export.module';
import { MediaSourcesModule } from './modules/media-sources/media-sources.module';
import { LinkGroupsModule } from './modules/link-groups/link-groups.module';
import { KeepAliveController } from './keep-alive/keep-alive.controller';
@Module({ 
  imports: [
    // Configuration module
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.development', '.env'],
    }),

    // ⚠️ Chỉ IMPORT ở đây để đăng ký ThrottlerStorage dùng chung toàn app -
    // KHÔNG bind ThrottlerGuard làm APP_GUARD toàn cục (sẽ áp rate-limit lên
    // MỌI endpoint, kể cả những nơi không cần/không được yêu cầu). Guard chỉ
    // được gắn thủ công ở đúng 1 chỗ cần chống spam: `POST /auth/register`
    // (xem `@UseGuards(ThrottlerGuard)` + `@Throttle(...)` trong
    // `auth.controller.ts`). Cấu hình `default` dưới đây chỉ là fallback
    // KHÔNG thực sự áp dụng ở đâu cả trừ khi 1 route tự gắn guard.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 1000,
      },
    ]),

    // Database connection using config service
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getTypeOrmConfig,
    }),

    // Feature Modules
    UsersModule,
    AuthModule,
    DepartmentsModule,
    CustomersModule,
    DepositsModule,
    LeaveRequestsModule,
    AuditModule,
    ZkDeviceModule,
    AttendanceExportModule,
    MediaSourcesModule,
    LinkGroupsModule,
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      serveRoot: '/',
      exclude: ['/api/(.*)'],
      serveStaticOptions: {
        index: ['index.html'],
      },
    }),
  ],
  controllers: [AppController, KeepAliveController],
  providers: [AppService],
})
export class AppModule {}
// DB Config updated 2026-03-31