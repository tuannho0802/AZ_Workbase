import { IsString, IsOptional, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO cho `PATCH /users/me/profile` - tự sửa hồ sơ CHÍNH MÌNH. Cố tình
 * KHÔNG có field `email` (đổi email đi qua endpoint riêng
 * `PATCH /users/:id/email`, gate bằng permission riêng `profile.edit_email`
 * - mặc định chỉ Admin) và KHÔNG có `role`/`departmentId`/`isActive`/
 * `employeeCode` (các trường quản trị này vẫn CHỈ sửa được qua
 * `PATCH /users/:id` với `users.manage`, không phải tự phục vụ).
 */
export class UpdateOwnProfileDto {
  @ApiProperty({ example: 'Nguyễn Văn A', required: false })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Tên phải có ít nhất 2 ký tự' })
  name?: string;

  @ApiProperty({ example: '0901234567', required: false })
  @IsOptional()
  @Matches(/^(09|08|07|03|05)[0-9]{8}$/, {
    message: 'Số điện thoại không hợp lệ',
  })
  phone?: string;
}
