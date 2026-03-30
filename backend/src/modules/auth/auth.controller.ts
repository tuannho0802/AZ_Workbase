import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập vào hệ thống', description: 'API đăng nhập xác thực JWT cho mọi người dùng.' })
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công, trả về access_token, refresh_token và thông tin user.' })
  @ApiResponse({ status: 401, description: 'Tài khoản không tồn tại hoặc mật khẩu sai.' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ (lỗi Email, Password trống).' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }
}
