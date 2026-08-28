import { IsEmail, IsString, MinLength, IsOptional, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * ⚠️ CỐ TÌNH không có field `role`/`isActive`/`approvalStatus` - đây là API
 * CÔNG KHAI (không cần đăng nhập), không được để người đăng ký tự chọn
 * quyền cho mình. Role mặc định luôn là EMPLOYEE (xem AuthService.register),
 * approvalStatus mặc định luôn PENDING - admin/assistant đổi role sau khi
 * duyệt nếu cần (qua UsersService.update, không phải qua endpoint này).
 */
export class RegisterDto {
  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'nva@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'MatKhau123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ example: '0912345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 1, description: 'Phòng ban muốn đăng ký (tuỳ chọn)' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;
}
