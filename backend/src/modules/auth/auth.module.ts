import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') as any,
        },
      }),
    }),
    // ⚠️ ThrottlerModule.forRoot() ở AppModule KHÔNG tự "cascade" xuống các
    // feature module con qua DI (chỉ export được NGƯỢC lên module cha, mà
    // AppModule là root nên không module nào import ngược lại nó) - phải
    // import lại ở đây để `ThrottlerGuard` dùng trong `auth.controller.ts`
    // (`POST /auth/register`) resolve được `ThrottlerStorage`. Cùng config
    // `default` như AppModule cho nhất quán - không tạo storage riêng biệt
    // có ý nghĩa khác, chỉ là yêu cầu bắt buộc của cách NestJS DI hoạt động
    // với dynamic module.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 1000,
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule { }