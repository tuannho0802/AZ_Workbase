import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuditService } from '../audit/audit.service';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';
import { Role } from '../../common/enums/role.enum';
import { getJwtRefreshSecret } from '../../common/security/jwt-secrets';
import { SecurityConfigService } from '../../common/security/security-config.service';
import { LoginIpBlockService } from '../../common/security/login-ip-block.service';

// [AGENT] OLD CODE (giữ để rollback, P3.1): hằng số cứng
//   export const LOGIN_MAX_FAILED_ATTEMPTS = 5;
//   export const LOGIN_LOCK_MINUTES = 5;
// NEW: ngưỡng/thời gian khoá lấy từ bảng `security_config` qua SecurityConfigService (cache ~30s, kẹp giá trị hợp lệ).

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
    private securityConfig: SecurityConfigService,
    private loginIpBlocks: LoginIpBlockService,
  ) {}

  private async generateTokens(userId: number, email: string, role: string) {
    const payload = { sub: userId, email, role };

   // Access token: uses default secret and expiresIn from JwtModule config
   const access_token = this.jwtService.sign(payload);

   // Refresh token: explicitly provide secret and expiresIn, with fallback values
   // [AGENT] OLD CODE (giữ để rollback): const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET') || 'default-refresh-secret';
   // NEW (P3.4): bỏ fallback; cùng getter với verify ở refresh().
   const refreshSecret = getJwtRefreshSecret(this.configService);
   const refreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';

   // `jti` ngẫu nhiên: 2 lần làm mới trong cùng 1 giây (2 thiết bị) KHÔNG được ra token giống hệt nhau
   // (nếu giống, 2 thiết bị dùng chung 1 phiên và không phân biệt được).
   const refresh_token = this.jwtService.sign({ ...payload, jti: randomUUID() }, {
    secret: refreshSecret,
    expiresIn: refreshExpiresIn as any,
  });

   return { access_token, refresh_token };
 }

  // Hash giả để so khớp khi email không tồn tại - giữ thời gian phản hồi gần như nhau (chống dò email
  // qua độ trễ). Tạo lười (lần đầu cần) để không tốn thời gian ở cold start.
  private dummyHashPromise: Promise<string> | null = null;

  /**
   * PLAN_HARDENING P4 - kiểm tra Basic auth cho Swagger `/api/docs*`.
   * Chỉ trả `true` khi: tài khoản tồn tại, chưa xoá/từ chối/chờ duyệt, `isActive`, mật khẩu đúng và
   * `role === 'admin'` (role cố định, KHÔNG phải role tuỳ chỉnh có tên hiển thị "Admin").
   * Không ném lỗi, không đổi trạng thái DB (không lưu refresh token, không updateLastLogin, không audit
   * USER_LOGIN) - đây không phải đăng nhập vào app. Không log mật khẩu.
   */
  async verifySwaggerAdmin(email: string, password: string): Promise<boolean> {
    const user = await this.usersService.findByEmailIncludingDeleted(email);

    if (!user || !user.password) {
      // So khớp với hash giả để không lộ "email có tồn tại hay không" qua thời gian phản hồi.
      this.dummyHashPromise ??= bcrypt.hash('swagger-dummy-password', 10);
      await bcrypt.compare(password, await this.dummyHashPromise);
      return false;
    }

    const matched = await bcrypt.compare(password, user.password);
    if (!matched) return false;

    return (
      user.role === Role.ADMIN &&
      user.deletedAt == null &&
      Number(user.isActive) === 1 &&
      user.approvalStatus === ApprovalStatus.APPROVED
    );
  }

  private buildLockedException(seconds: number, maxAttempts: number): HttpException {
    const minutes = Math.max(Math.ceil(seconds / 60), 1);
    return new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        // `code` + `retryAfterSeconds` được AllExceptionsFilter chuyển tiếp cho FE.
        code: 'LOGIN_LOCKED',
        retryAfterSeconds: seconds,
        message: `Bạn đã nhập sai mật khẩu quá ${maxAttempts} lần. Vui lòng thử lại sau ${minutes} phút.`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** 429 `IP_LOCKED` (P3.2): FE login đọc `retryAfterSeconds` như `LOGIN_LOCKED` nên tái dùng banner đếm ngược. */
  private buildIpLockedException(seconds: number): HttpException {
    const minutes = Math.max(Math.ceil(seconds / 60), 1);
    return new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'IP_LOCKED',
        retryAfterSeconds: seconds,
        message: `Có quá nhiều lần đăng nhập sai từ địa chỉ mạng của bạn. Vui lòng thử lại sau ${minutes} phút.`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /**
   * @param ip IP client thật (controller truyền `getDirectClientIp(req)`); `null` -> bỏ qua khoá IP (khoá theo tài
   *           khoản vẫn hoạt động).
   * @param userAgent chỉ dùng để ghi sự kiện bảo mật (P4).
   */
  async login(loginDto: LoginDto, ip: string | null = null, userAgent: string | null = null) {
    const cfg = await this.securityConfig.get();

    // P3.2: kiểm tra khoá IP TRƯỚC mọi thứ khác (1 query rẻ). KHÔNG ghi sự kiện cho request bị từ chối vì IP khoá:
    // chỉ có 1 dòng LOGIN_IP_BLOCKED lúc bắt đầu khoá (P4.1) nên bảng audit không phình theo kẻ tấn công.
    const ipLockedSeconds = await this.loginIpBlocks.getRemainingSeconds(ip);
    if (ipLockedSeconds > 0) {
      throw this.buildIpLockedException(ipLockedSeconds);
    }
    const ipCfg = {
      maxAttempts: cfg.ipMaxFailedAttempts,
      windowMinutes: cfg.ipWindowMinutes,
      lockMinutes: cfg.ipLockMinutes,
    };
    // Ghi nhận 1 lần sai vào bộ đếm IP; nếu lần này làm IP chạm ngưỡng -> ghi 1 dòng LOGIN_IP_BLOCKED.
    const recordIpFailure = async () => {
      const res = await this.loginIpBlocks.recordFailure(ip, loginDto.email, ipCfg);
      if (res.lockedSeconds > 0) {
        this.auditService.logSecurityEventAsync({
          action: 'LOGIN_IP_BLOCKED',
          ip,
          userAgent,
          detail: {
            email: loginDto.email,
            failedCount: res.attempts,
            lockMinutes: cfg.ipLockMinutes,
            windowMinutes: cfg.ipWindowMinutes,
          },
        });
      }
      return res;
    };

    // Kèm tài khoản đã xoá mềm: tài khoản bị từ chối/xoá phải nhận đúng thông báo, không phải "không tồn tại".
    const user = await this.usersService.findByEmailIncludingDeleted(loginDto.email);

    if (!user) {
      // P4.1: ghi cả email CHƯA tồn tại (userId = null). Email sai định dạng bị thay bằng "[không phải email]".
      this.auditService.logSecurityEventAsync({
        userId: null,
        action: 'LOGIN_UNKNOWN_EMAIL',
        ip,
        userAgent,
        detail: { email: loginDto.email },
      });
      // Email lạ cũng tính vào IP (1 IP thử hàng loạt email vẫn chạm ngưỡng).
      const ipRes = await recordIpFailure();
      if (ipRes.lockedSeconds > 0) throw this.buildIpLockedException(ipRes.lockedSeconds);
      throw new UnauthorizedException('Tài khoản không tồn tại');
    }

    // Bị TỪ CHỐI đăng ký (đã xoá mềm ở `rejectUser()`, hoặc dòng cũ chưa dọn): báo rõ + lý do nếu có. Kiểm tra
    // TRƯỚC `deletedAt` để tài khoản rejected không bị báo chung chung là "đã bị xoá".
    if (user.approvalStatus === ApprovalStatus.REJECTED) {
      throw new ForbiddenException(
        user.rejectionReason
          ? `Tài khoản đã bị từ chối. Lý do: ${user.rejectionReason}`
          : 'Tài khoản đã bị từ chối.',
      );
    }
    if (user.deletedAt != null) {
      throw new ForbiddenException('Tài khoản đã bị xoá.');
    }

    if (Number(user.isActive) === 0) {
      throw new ForbiddenException('Tài khoản bị khóa');
    }

    // ⚠️ Chặn đăng nhập nếu tài khoản (tự đăng ký qua /auth/register) chưa được Admin/Assistant duyệt - kiểm tra
    // TRƯỚC khi so khớp mật khẩu (không lộ "mật khẩu đúng/sai" cho tài khoản chưa được phép đăng nhập).
    if (user.approvalStatus === ApprovalStatus.PENDING) {
      throw new ForbiddenException('Tài khoản đang chờ Admin/Assistant duyệt. Vui lòng quay lại sau.');
    }

    if (!user.password) {
      throw new UnauthorizedException('Tài khoản không hợp lệ');
    }

    // Đang bị khoá do sai mật khẩu quá nhiều lần: chặn TRƯỚC khi so mật khẩu (đúng cũng không cho vào,
    // và không tốn bcrypt cho kẻ đang dò).
    const lockedSeconds = await this.usersService.getLoginLockRemainingSeconds(user.id);
    if (lockedSeconds > 0) {
      throw this.buildLockedException(lockedSeconds, cfg.accountMaxFailedAttempts);
    }

    const isPasswordMatching = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordMatching) {
      // Ghi nhận sai cho CẢ tài khoản và IP (song song, độc lập nhau).
      const [{ attempts, lockedSeconds: nowLocked }, ipRes] = await Promise.all([
        this.usersService.recordFailedLogin(user.id, cfg.accountMaxFailedAttempts, cfg.accountLockMinutes),
        recordIpFailure(),
      ]);

      // P4.1: mọi lần sai đều ghi (có userId); chạm ngưỡng tài khoản thì thêm 1 dòng ACCOUNT_LOCKED.
      this.auditService.logSecurityEventAsync({
        userId: user.id,
        action: 'LOGIN_FAILED',
        ip,
        userAgent,
        detail: { email: user.email, attempts },
      });
      if (nowLocked > 0) {
        this.logger.warn(`[SECURITY] User ID ${user.id} bị khoá đăng nhập ${cfg.accountLockMinutes} phút do sai mật khẩu ${attempts} lần`);
        this.auditService.logSecurityEventAsync({
          userId: user.id,
          action: 'ACCOUNT_LOCKED',
          ip,
          userAgent,
          detail: { email: user.email, attempts, lockMinutes: cfg.accountLockMinutes },
        });
      }

      // Cả 2 cùng khoá -> báo cái khoá lâu hơn (người dùng không phải thử lại sớm rồi bị chặn tiếp).
      if (ipRes.lockedSeconds > 0 && ipRes.lockedSeconds >= nowLocked) {
        throw this.buildIpLockedException(ipRes.lockedSeconds);
      }
      if (nowLocked > 0) {
        throw this.buildLockedException(nowLocked, cfg.accountMaxFailedAttempts);
      }
      const remaining = Math.max(cfg.accountMaxFailedAttempts - attempts, 0);
      throw new UnauthorizedException({
        statusCode: HttpStatus.UNAUTHORIZED,
        code: 'WRONG_PASSWORD',
        remainingAttempts: remaining,
        message: `Mật khẩu sai. Bạn còn ${remaining} lần thử trước khi bị khoá ${cfg.accountLockMinutes} phút.`,
      });
    }

    await this.usersService.clearLoginFailures(user.id);

    const { access_token, refresh_token } = await this.generateTokens(user.id, user.email, user.role);

    // ⭐ ROTATION: Lưu hash của refresh_token vào DB
    await this.usersService.saveRefreshToken(user.id, refresh_token);
    // Đăng nhập thành công KHÔNG xoá bộ đếm/khoá IP (kẻ tấn công không được dùng 1 tài khoản hợp lệ để reset).
    await this.usersService.updateLastLogin(user.id, ip);

    // Log đăng nhập thành công
    this.auditService.logActionAsync(
      user.id,
      'USER_LOGIN',
      'auth',
      user.id,
      null,
      { email: user.email, role: user.role },
    );

    // Ký avatarUrl (object key -> Presigned GET URL, TTL 1h) TRƯỚC khi trả
    // ra khỏi service, dùng lại ĐÚNG UsersService.signAvatarUrl() - không tự
    // viết logic ký riêng ở đây (xem comment ở users.service.ts: "Gọi
    // signAvatarUrl ở TẤT CẢ nơi trả User(s) ra ngoài - thiếu 1 chỗ là
    // avatar hiện ra key thô, không load được ảnh"). FE lưu thẳng field này
    // vào authStore lúc login - không phải gọi thêm GET /users/me chỉ để có
    // avatar cho header.
    const signedUser = await this.usersService.signAvatarUrl(user);

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        // ⚠️ MỚI (isRootAdmin) - THIẾU field này khiến FE (authStore) không
        // biết user vừa login có phải Root Admin hay không cho tới khi tự
        // gọi thêm GET /users/me - lỗi đã phát hiện khi rà soát cùng đợt
        // isRootAdmin (xem JSDoc User.isRootAdmin/migration
        // AddIsRootAdminToUsers1781000000000). PermissionGuard/jwt.strategy
        // luôn tự nạp LIVE từ DB mỗi request nên KHÔNG có rủi ro bảo mật gì
        // khi trả field này ra ngay lúc login (chỉ là hiển thị UI sớm hơn).
        isRootAdmin: user.isRootAdmin,
        avatarUrl: signedUser?.avatarUrl ?? null,
        avatarKey: signedUser?.avatarKey ?? null,
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

    // Kèm tài khoản đã xoá mềm: email vẫn bị UNIQUE giữ chỗ -> báo 409 thay vì để DB ném ER_DUP_ENTRY (500).
    const existing = await this.usersService.findByEmailIncludingDeleted(dto.email);
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
      positionId: dto.positionId,
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
        // [AGENT] OLD CODE: secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        secret: getJwtRefreshSecret(this.configService),
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

    // 3. ⭐ TRÁI TIM CỦA ROTATION: token gửi lên phải thuộc 1 phiên của user; thay bằng token mới (compare-and-set).
    // [AGENT] OLD CODE: const isTokenValid = await bcrypt.compare(refreshTokenFromClient, user.hashedRefreshToken);
    // (bcrypt chỉ đọc 72 byte đầu của JWT -> mọi token cùng user đều "khớp" + tốn ~150ms CPU/lần).
    const { access_token, refresh_token: new_refresh_token } = await this.generateTokens(user.id, user.email, user.role);
    const isTokenValid = await this.usersService.rotateRefreshToken(
      user.id,
      refreshTokenFromClient,
      new_refresh_token,
      user.hashedRefreshToken,
    );

    if (!isTokenValid) {
      // 🚨 TOKEN RE-USE DETECTED: Thu hồi toàn bộ session ngay lập tức
      // [AGENT] OLD CODE: this.logger.warn(`[SECURITY] Token reuse detected for user ID: ${user.id} (${user.email}). Revoking all sessions.`);
      // (plan CPU Mục 2B: log reuse chỉ dùng userId, không log email)
      this.logger.warn(`[SECURITY] Token reuse detected for user ID: ${user.id}. Revoking all sessions.`);

      await this.usersService.saveRefreshToken(user.id, null);
      throw new UnauthorizedException('Phát hiện nghi ngờ bảo mật. Toàn bộ phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại');
    }

    // 4. Token hợp lệ → cặp token mới đã được ghi vào đúng phiên ở bước 3.

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