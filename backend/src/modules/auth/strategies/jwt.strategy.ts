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
      role: user.role 
    };
  }
}