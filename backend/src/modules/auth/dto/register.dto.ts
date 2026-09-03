import { IsEmail, IsString, MinLength, IsOptional, IsInt, Matches, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * ⚠️ CỐ TÌNH không có field `role`/`isActive`/`approvalStatus` - đây là API
 * CÔNG KHAI (không cần đăng nhập), không được để người đăng ký tự chọn
 * quyền cho mình. Role mặc định luôn là EMPLOYEE (xem AuthService.register),
 * approvalStatus mặc định luôn PENDING - admin/assistant đổi role sau khi
 * duyệt nếu cần (qua UsersService.update, không phải qua endpoint này).
 *
 * Các rule validate còn lại (password, phone) khớp ĐÚNG với CreateUserDto
 * (form Admin tạo nhân viên) để 2 luồng tạo tài khoản có cùng 1 chuẩn mật
 * khẩu/SĐT, không có luồng nào yếu hơn luồng kia.
 */
export class RegisterDto {
  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'nva@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'Password@123',
    description: 'Mật khẩu (ít nhất 8 ký tự, có chữ hoa, chữ thường, số, ký tự đặc biệt)',
  })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Mật khẩu phải có chữ hoa, chữ thường, số và ký tự đặc biệt',
  })
  password: string;

  @ApiPropertyOptional({ example: '0912345678' })
  @IsOptional()
  @Matches(/^(09|08|07|03|05)[0-9]{8}$/, { message: 'Số điện thoại không hợp lệ' })
  phone?: string;

  @ApiPropertyOptional({ example: 1, description: 'Phòng ban muốn đăng ký (tuỳ chọn)' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  // ── Chống bot spam đăng ký (không liên quan tới nghiệp vụ, xem AuthService.register) ──

  @ApiProperty({
    description:
      'Token xác minh từ widget Cloudflare Turnstile ở Frontend (bắt buộc). Backend gọi ' +
      'siteverify để xác nhận token thật trước khi tạo tài khoản - xem TurnstileService.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Thiếu xác minh Turnstile - vui lòng tải lại trang và thử lại' })
  turnstileToken: string;

  @ApiPropertyOptional({
    description:
      'Honeypot - trường bẫy bot, PHẢI luôn rỗng khi gửi từ người dùng thật. Frontend ẩn ' +
      'field này bằng CSS (không dùng display:none để tránh 1 số bot bỏ qua field ẩn kiểu ' +
      'đó); bot điền form tự động (autofill mọi input thấy được trong DOM) thường điền cả ' +
      'field này -> có giá trị = chắc chắn là bot, xem AuthService.register().',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}