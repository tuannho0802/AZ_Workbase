import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    const secret = configService.get('JWT_SECRET');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: any) {
    const user = await this.usersService.findById(payload.sub);
    
    if (!user || !user.isActive) {
      console.error('[JWT STRATEGY] User not found or inactive:', payload.sub);
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    return { 
      id: user.id, 
      email: user.email, 
      role: user.role,
      // ⚠️ BẮT BUỘC - PermissionGuard/RolesController/UiVisibilityController
      // đều đọc field này để quyết định lối thoát hiểm Admin (xem JSDoc
      // User.isRootAdmin). Lấy LIVE từ DB mỗi request giống departmentId/
      // positionId bên dưới - KHÔNG lấy từ JWT payload (payload chỉ có
      // sub/email/role) để Root Admin bị thu hồi flag có hiệu lực ngay,
      // không cần chờ user đăng nhập lại.
      isRootAdmin: user.isRootAdmin,
      departmentId: user.departmentId,
      // ⚠️ BẮT BUỘC cho override tầng Position (PLAN mục 3.3) - thiếu dòng
      // này thì PermissionGuard/PermissionsService luôn nhận positionId =
      // undefined, khiến mọi Position override cấu hình qua UI KHÔNG BAO
      // GIỜ có hiệu lực trên request thật (dù merge logic ở PermissionsService
      // đã đúng) - lấy LIVE từ DB mỗi request giống departmentId, không lấy
      // từ JWT payload (payload chỉ có sub/email/role).
      positionId: user.positionId,
    };
  }
}