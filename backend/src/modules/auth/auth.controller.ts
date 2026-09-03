import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Request, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  // ⚠️ Rate-limit theo IP - 1 trong 3 lớp chống bot spam đăng ký (cộng dồn
  // với Honeypot + Cloudflare Turnstile, cả 3 đều bắt buộc phải cùng đúng -
  // xem AuthService.register()). 5 lần/10 phút/IP: đủ rộng rãi cho người
  // thật (kể cả nhiều người cùng đăng ký chung 1 IP văn phòng/NAT), nhưng
  // chặn được spam bot dồn dập. CHỈ gắn guard này ở đúng route này - KHÔNG
  // bind ThrottlerGuard làm APP_GUARD toàn cục (xem giải thích trong
  // `app.module.ts`).
  @UseGuards(ThrottlerGuard)
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
  async login(@Body() loginDto: LoginDto) {
    console.log('[Auth] Login attempt for:', loginDto.email);
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Làm mới Access Token (Rotation)' })
  @ApiResponse({ status: 200, description: 'Token mới được phát thành công.' })
  @ApiResponse({ status: 401, description: 'Token không hợp lệ hoặc đã bị thu hồi.' })
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đăng xuất (Thu hồi Refresh Token)' })
  @ApiResponse({ status: 200, description: 'Đăng xuất thành công.' })
  async logout(@Request() req: any) {
    await this.authService.logout(req.user.id);
    return { message: 'Đăng xuất thành công' };
  }
}