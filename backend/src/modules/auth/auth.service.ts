import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private async generateTokens(userId: number, email: string, role: string) {
    const payload = { sub: userId, email, role };
    const access_token = this.jwtService.sign(payload);
    const refresh_token = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET') as string,
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') as any,
    });
    return { access_token, refresh_token };
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    console.log("LOGIN ATTEMPT - Raw User from DB:", {
      id: user?.id,
      email: user?.email,
      isActive: user?.isActive,
      isActiveType: typeof user?.isActive,
      hasPassword: !!user?.password
    });
    
    if (!user) {
      throw new UnauthorizedException('Tài khoản không tồn tại');
    }

    if (Number(user.isActive) === 0) {
      throw new ForbiddenException('Tài khoản bị khóa');
    }

    if (!user.password) {
      throw new UnauthorizedException('Tài khoản không hợp lệ');
    }

    const isPasswordMatching = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordMatching) {
      throw new UnauthorizedException('Mật khẩu sai');
    }

    const { access_token, refresh_token } = await this.generateTokens(user.id, user.email, user.role);

    // ⭐ ROTATION: Lưu hash của refresh_token vào DB
    await this.usersService.saveRefreshToken(user.id, refresh_token);
    await this.usersService.updateLastLogin(user.id);

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
      },
    };
  }

  async refresh(refreshTokenFromClient: string) {
    // 1. Verify JWT signature & expiry
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshTokenFromClient, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
    }

    // 2. Tìm user kèm hashed_refresh_token từ DB (select: false nên dùng hàm riêng)
    const user = await this.usersService.findByIdWithRefreshToken(payload.sub);
    
    if (!user || Number(user.isActive) === 0) {
      throw new UnauthorizedException('Tài khoản không hợp lệ hoặc đã bị khóa');
    }

    if (!user.hashedRefreshToken) {
      // Session đã bị thu hồi (logout hoặc đã bị detected)
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
    }

    // 3. ⭐ TRÁI TIM CỦA ROTATION: So sánh token gửi lên với hash trong DB
    const isTokenValid = await bcrypt.compare(refreshTokenFromClient, user.hashedRefreshToken);

    if (!isTokenValid) {
      // 🚨 TOKEN RE-USE DETECTED: Thu hồi toàn bộ session ngay lập tức
      console.warn(`[SECURITY] Token reuse detected for user ID: ${user.id} (${user.email}). Revoking all sessions.`);
      await this.usersService.saveRefreshToken(user.id, null);
      throw new UnauthorizedException('Phát hiện nghi ngờ bảo mật. Toàn bộ phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại');
    }

    // 4. Token hợp lệ → Phát cặp token mới + Cập nhật hash mới vào DB
    const { access_token, refresh_token: new_refresh_token } = await this.generateTokens(user.id, user.email, user.role);
    await this.usersService.saveRefreshToken(user.id, new_refresh_token);

    console.log(`[AUTH] Token rotated successfully for user ID: ${user.id}`);

    return {
      access_token,
      refresh_token: new_refresh_token,
    };
  }

  async logout(userId: number): Promise<void> {
    // Thu hồi refresh token trong DB
    await this.usersService.saveRefreshToken(userId, null);
    console.log(`[AUTH] User ID ${userId} logged out. Refresh token revoked.`);
  }
}
