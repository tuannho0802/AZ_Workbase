import { Injectable, UnauthorizedException, ForbiddenException, ConflictException, Logger } from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuditService } from '../audit/audit.service';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
  ) {}

  private async generateTokens(userId: number, email: string, role: string) {
    const payload = { sub: userId, email, role };

   // Access token: uses default secret and expiresIn from JwtModule config
   const access_token = this.jwtService.sign(payload);

   // Refresh token: explicitly provide secret and expiresIn, with fallback values
   const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET') || 'default-refresh-secret';
   const refreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';

   const refresh_token = this.jwtService.sign(payload, {
    secret: refreshSecret,
    expiresIn: refreshExpiresIn as any,
  });

   return { access_token, refresh_token };
 }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    // Removed verbose debug log

    
    if (!user) {
      throw new UnauthorizedException('Tài khoản không tồn tại');
    }

    if (Number(user.isActive) === 0) {
      throw new ForbiddenException('Tài khoản bị khóa');
    }

    // ⚠️ Chặn đăng nhập nếu tài khoản (tự đăng ký qua /auth/register) chưa
    // được Admin/Assistant duyệt - kiểm tra TRƯỚC khi so khớp mật khẩu, để
    // không lộ thông tin "mật khẩu đúng/sai" cho tài khoản chưa được phép
    // đăng nhập (không có ý nghĩa gì để biết password đúng nếu chưa duyệt).
    if (user.approvalStatus === ApprovalStatus.PENDING) {
      throw new ForbiddenException('Tài khoản đang chờ Admin/Assistant duyệt. Vui lòng quay lại sau.');
    }
    if (user.approvalStatus === ApprovalStatus.REJECTED) {
      throw new ForbiddenException(
        user.rejectionReason
          ? `Yêu cầu đăng ký đã bị từ chối: ${user.rejectionReason}`
          : 'Yêu cầu đăng ký đã bị từ chối.',
      );
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

    // Log đăng nhập thành công
    this.auditService.logActionAsync(
      user.id,
      'USER_LOGIN',
      'auth',
      user.id,
      null,
      { email: user.email, role: user.role },
    );

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

  /**
   * Đăng ký tài khoản công khai (không cần đăng nhập). Tài khoản tạo ra ở
   * trạng thái approvalStatus=PENDING - KHÔNG đăng nhập được cho tới khi
   * Admin/Assistant duyệt (xem UsersController.approveUser). Role LUÔN là
   * EMPLOYEE (thấp nhất, cứng trong code) - RegisterDto không có field role
   * nên không có đường nào client tự nâng quyền qua API này.
   *
   * KHÔNG trả về access_token/refresh_token (khác login()) - tài khoản chưa
   * được duyệt thì chưa nên đăng nhập được, kể cả ngay sau khi đăng ký.
   *
   * ── Chống bot spam đăng ký ──
   * 1. Vercel BotID (thay cho Cloudflare Turnstile cũ) - chặn ở TẦNG PROXY,
   *    TRƯỚC KHI request chạm tới backend này. Frontend gọi route nội bộ
   *    `POST /api/auth/register` trên chính domain Next.js (Vercel), route
   *    đó gọi `checkBotId()` (package `botid`) rồi mới forward sang backend
   *    NestJS này nếu là người thật - xem
   *    `frontend/src/app/api/auth/register/route.ts` +
   *    `frontend/src/app/layout.tsx` (`<BotIdClient>`) +
   *    `frontend/next.config.js` (`withBotId`). Backend KHÔNG tự verify lại
   *    BotID (không có cách nào gọi `checkBotId()` từ ngoài ngữ cảnh
   *    server Next.js) - đây là khác biệt quan trọng so với Turnstile cũ
   *    (BE tự gọi siteverify, verify được cả khi ai đó gọi thẳng backend).
   *    ⚠️ Vì backend này có domain public riêng (xem `backend/vercel.json`),
   *    về lý thuyết vẫn có thể bị gọi thẳng bỏ qua route BotID ở Frontend -
   *    2 lớp dưới đây (rate-limit + honeypot) là lưới chặn còn lại cho
   *    trường hợp đó, không phụ thuộc BotID.
   * 2. Rate-limit theo IP - chặn ở tầng Guard/Controller (`ThrottlerGuard` +
   *    `@Throttle` trong `auth.controller.ts`), KHÔNG chạy tới đây nếu đã bị
   *    chặn - không cần xử lý gì thêm trong service này.
   * 3. Honeypot (`dto.website`) - kiểm tra ĐẦU TIÊN trong service vì rẻ nhất
   *    (không gọi mạng, không đụng DB). Nếu có giá trị -> chắc chắn là bot
   *    (form thật ẩn field này, người dùng thật không bao giờ điền được) ->
   *    trả về Y HỆT response thành công nhưng KHÔNG tạo tài khoản thật, để
   *    bot không biết đã bị phát hiện (tránh bot thích nghi/thử lại field
   *    khác).
   */
  async register(dto: RegisterDto, clientIp?: string) {
    // Honeypot: bot điền -> giả vờ thành công, không làm gì thêm.
    if (dto.website && dto.website.trim().length > 0) {
      this.logger.warn(
        `[Auth] Honeypot triggered - nghi ngờ bot đăng ký với email "${dto.email}" từ IP ${clientIp ?? 'unknown'}. Bỏ qua, không tạo tài khoản.`,
      );
      return {
        message: 'Đăng ký thành công. Tài khoản của bạn đang chờ Admin/Assistant duyệt trước khi có thể đăng nhập.',
        userId: 0,
      };
    }

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email đã được đăng ký');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.createPendingRegistration({
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
      phone: dto.phone,
      departmentId: dto.departmentId,
    });

    this.logger.log(`[Auth] New self-registration pending approval: ${user.email} (ID ${user.id})`);

    this.auditService.logActionAsync(
      user.id,
      'USER_SELF_REGISTER',
      'user',
      user.id,
      null,
      { email: user.email, name: user.name },
    );

    return {
      message: 'Đăng ký thành công. Tài khoản của bạn đang chờ Admin/Assistant duyệt trước khi có thể đăng nhập.',
      userId: user.id,
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
      this.logger.warn(`[SECURITY] Token reuse detected for user ID: ${user.id} (${user.email}). Revoking all sessions.`);

      await this.usersService.saveRefreshToken(user.id, null);
      throw new UnauthorizedException('Phát hiện nghi ngờ bảo mật. Toàn bộ phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại');
    }

    // 4. Token hợp lệ → Phát cặp token mới + Cập nhật hash mới vào DB
    const { access_token, refresh_token: new_refresh_token } = await this.generateTokens(user.id, user.email, user.role);
    await this.usersService.saveRefreshToken(user.id, new_refresh_token);

    this.logger.log(`[AUTH] Token rotated successfully for user ID: ${user.id}`);


    return {
      access_token,
      refresh_token: new_refresh_token,
    };
  }

  async logout(userId: number): Promise<void> {
    // Thu hồi refresh token trong DB
    await this.usersService.saveRefreshToken(userId, null);
    this.logger.log(`[AUTH] User ID ${userId} logged out. Refresh token revoked.`);

  }
}