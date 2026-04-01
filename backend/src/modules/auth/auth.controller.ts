import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
