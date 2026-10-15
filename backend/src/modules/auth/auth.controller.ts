import { Controller, Post, Get, Delete, Param, Body, HttpCode, HttpStatus, UseGuards, Request, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordRequiredDto } from './dto/change-password-required.dto';
import { AllowWhenPasswordChangeRequired } from '../../common/decorators/allow-when-password-change-required.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ThrottlerBehindProxyGuard } from '../../common/guards/throttler-behind-proxy.guard';
import { getClientCountry, getDirectClientIp } from '../../common/security/client-ip';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  // ⚠️ Rate-limit theo IP - 1 trong 3 lớp chống bot spam đăng ký (cộng dồn
  // với Honeypot + Vercel BotID ở route trung gian phía FE, cả 3 đều bắt
  // buộc phải cùng đúng - xem AuthService.register()). 5 lần/10 phút/IP: đủ
  // rộng rãi cho người thật (kể cả nhiều người cùng đăng ký chung 1 IP văn
  // phòng/NAT), nhưng chặn được spam bot dồn dập. CHỈ gắn guard này ở đúng
  // route này - KHÔNG bind ThrottlerGuard làm APP_GUARD toàn cục (xem giải
  // thích trong `app.module.ts`).
  //
  // ⚠️ Dùng `ThrottlerBehindProxyGuard` (đọc header `x-az-client-ip`) THAY
  // CHO `ThrottlerGuard` gốc (đọc `req.ip`) - xem giải thích đầy đủ trong
  // throttler-behind-proxy.guard.ts. FE và BE là 2 Vercel project tách
  // riêng, `req.ip` ở đây bị Vercel edge ghi đè thành IP nội bộ của FE cho
  // MỌI người dùng đi qua route BotID trung gian - dùng `ThrottlerGuard`
  // gốc sẽ coi tất cả là chung 1 IP (đúng bug thật đã xảy ra: người dùng
  // thật bị 429 hàng loạt, đổi IP/dùng WARP vẫn dính).
  @UseGuards(ThrottlerBehindProxyGuard)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({
    summary:
      'Đăng ký tài khoản (công khai, không cần đăng nhập) - tài khoản tạo ra sẽ ở trạng thái CHỜ DUYỆT, cần Admin/Assistant duyệt mới đăng nhập được. Có rate-limit theo IP + honeypot chống bot; Frontend còn có lớp Vercel BotID chặn trước khi request tới được endpoint này.',
  })
  @ApiResponse({ status: 201, description: 'Đăng ký thành công, đang chờ duyệt.' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ.' })
  @ApiResponse({ status: 409, description: 'Email đã được đăng ký.' })
  @ApiResponse({ status: 429, description: 'Quá nhiều lần đăng ký từ IP này, vui lòng thử lại sau.' })
  async register(@Body() dto: RegisterDto, @Req() req: any) {
    // `req.ip` chỉ đúng IP thật (thay vì IP proxy) nhờ `trust proxy` đã bật
    // trong main.ts - xem comment ở đó để biết vì sao bắt buộc phải có.
    return this.authService.register(dto, req.ip);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập vào hệ thống' })
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công, trả về access_token, refresh_token và thông tin user.' })
  @ApiResponse({ status: 401, description: 'Tài khoản không tồn tại hoặc mật khẩu sai.' })
  @ApiResponse({ status: 403, description: 'Tài khoản bị khóa.' })
  @ApiResponse({
    status: 429,
    description:
      'Tạm khoá đăng nhập: `code=LOGIN_LOCKED` (sai mật khẩu quá ngưỡng của tài khoản) hoặc `code=IP_LOCKED` (quá nhiều lần sai từ 1 IP). Ngưỡng/thời gian khoá lấy từ bảng `security_config`; kèm `retryAfterSeconds`.',
  })
  async login(@Body() loginDto: LoginDto, @Req() req: any) {
    // [AGENT] OLD CODE (giữ để rollback): console.log('[Auth] Login attempt for:', loginDto.email);
    // [AGENT] NEW CODE (PLAN CPU Mục 13F): bỏ log này - vi phạm SKILL_FILE_MANAGEMENT §6.1 (cấm console.*)
    // và ghi email (PII) ra log mỗi lần đăng nhập. Lỗi đăng nhập vẫn do AuthService xử lý/log như cũ.
    // P3.2: IP chỉ lấy từ `req.ip` (login gọi thẳng BE từ trình duyệt; header `x-az-client-ip` do client tự gắn nên KHÔNG tin ở đây).
    const ua = typeof req?.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : null;
    return this.authService.login(loginDto, getDirectClientIp(req), ua, getClientCountry(req));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Làm mới Access Token (Rotation)' })
  @ApiResponse({ status: 200, description: 'Token mới được phát thành công.' })
  @ApiResponse({ status: 401, description: 'Token không hợp lệ hoặc đã bị thu hồi.' })
  async refresh(@Body('refreshToken') refreshToken: string, @Req() req: any) {
    // P5: IP lấy từ `req.ip` (KHÔNG tin header x-az-client-ip do client tự gắn) - cùng cách với login.
    const ua = typeof req?.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : null;
    return this.authService.refresh(refreshToken, getDirectClientIp(req), ua, getClientCountry(req));
  }

  // ── P5: thiết bị đăng nhập của CHÍNH MÌNH (không cần permission - ai cũng quản được phiên của mình) ──

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách thiết bị đang đăng nhập của tôi (đánh dấu thiết bị hiện tại)' })
  async listSessions(@Request() req: any) {
    return this.authService.listSessions(req.user.id, req.user.sid);
  }

  @Delete('sessions/:sid')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đăng xuất 1 thiết bị của tôi' })
  async revokeSession(@Param('sid') sid: string, @Request() req: any) {
    return this.authService.revokeSession(req.user.id, sid, req.user.sid);
  }

  @Delete('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đăng xuất mọi thiết bị KHÁC của tôi (giữ thiết bị hiện tại)' })
  async revokeOtherSessions(@Request() req: any) {
    return this.authService.revokeOtherSessions(req.user.id, req.user.sid);
  }

  // ── P6: đổi mật khẩu BẮT BUỘC (đang bị buộc đổi hoặc mật khẩu hết hạn). Chỉ cần đăng nhập, KHÔNG gate permission
  // (người dùng chưa có/chưa được cấp `profile.change_password` vẫn phải thoát được trạng thái bị khoá). ──
  @Post('change-password-required')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @AllowWhenPasswordChangeRequired()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đổi mật khẩu bắt buộc (mật khẩu được cấp + mật khẩu mới + nhập lại); thu hồi các phiên khác' })
  @ApiResponse({ status: 400, description: 'Không khớp / không đạt chính sách / không bị yêu cầu đổi / trùng mật khẩu cũ / mật khẩu được cấp không đúng.' })
  @ApiResponse({ status: 401, description: 'Phiên đăng nhập không hợp lệ.' })
  async changePasswordRequired(@Body() dto: ChangePasswordRequiredDto, @Request() req: any) {
    return this.authService.changePasswordRequired(req.user.id, dto, req.user.sid);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @AllowWhenPasswordChangeRequired()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đăng xuất (Thu hồi Refresh Token)' })
  @ApiResponse({ status: 200, description: 'Đăng xuất thành công.' })
  async logout(@Request() req: any) {
    await this.authService.logout(req.user.id);
    return { message: 'Đăng xuất thành công' };
  }
}