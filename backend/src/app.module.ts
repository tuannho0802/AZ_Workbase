import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getTypeOrmConfig } from './config/database.config';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { DepositsModule } from './modules/deposits/deposits.module';

@Module({
  imports: [
    // Configuration module
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.development', '.env'],
    }),

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
// DB Config updated 2026-03-31
