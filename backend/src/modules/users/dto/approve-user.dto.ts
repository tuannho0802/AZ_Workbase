import { IsOptional, IsInt, IsString, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ApproveUserDto {
  // ⚠️ FIX BUG THẬT (400 khi gán role tuỳ chỉnh lúc duyệt) - trước đây
  // @IsEnum(Role) dùng enum tĩnh (chỉ 4 role hệ thống). Xem giải thích đầy
  // đủ ở update-user.dto.ts - chỉ validate định dạng, tồn tại hay không do
  // UsersService kiểm tra qua bảng `roles`.
  @ApiPropertyOptional({
    example: 'employee',
    description: 'Đổi role khi duyệt (để trống thì giữ nguyên EMPLOYEE mặc định lúc đăng ký) - mã role khớp `roles.code`',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9_]*$/, { message: 'Mã role không hợp lệ' })
  role?: string;

  @ApiPropertyOptional({ description: 'Đổi phòng ban khi duyệt (để trống thì giữ nguyên lúc đăng ký)' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;
}