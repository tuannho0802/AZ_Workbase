import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { ALLOW_WHEN_PASSWORD_CHANGE_REQUIRED } from '../decorators/allow-when-password-change-required.decorator';

export const PASSWORD_CHANGE_REQUIRED_CODE = 'PASSWORD_CHANGE_REQUIRED';

/**
 * P6 - CHẶN Ở BE (không chỉ FE). Là APP_INTERCEPTOR (không phải APP_GUARD) vì guard toàn cục chạy TRƯỚC JwtAuthGuard cấp controller
 * -> lúc đó `req.user` chưa có; interceptor chạy SAU mọi guard nên đã có `req.user` do JwtStrategy gắn.
 * Request không đăng nhập (login/register/refresh/health...) không có `req.user` -> bỏ qua.
 */
@Injectable()
export class PasswordChangeRequiredInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    if (!req?.user?.passwordChangeRequired) return next.handle();

    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_WHEN_PASSWORD_CHANGE_REQUIRED, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed) return next.handle();

    throw new ForbiddenException({
      statusCode: 403,
      code: PASSWORD_CHANGE_REQUIRED_CODE,
      reason: req.user.passwordExpired ? 'EXPIRED' : 'MUST_CHANGE',
      message: req.user.passwordExpired
        ? 'Mật khẩu đã hết hạn, vui lòng đổi mật khẩu mới để tiếp tục'
        : 'Bạn cần đổi mật khẩu trước khi tiếp tục sử dụng hệ thống',
    });
  }
}
