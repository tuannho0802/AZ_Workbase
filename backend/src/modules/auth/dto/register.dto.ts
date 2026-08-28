import { IsEmail, IsString, MinLength, IsOptional, IsInt, Matches } from 'class-validator';
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
}