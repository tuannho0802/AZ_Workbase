import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO cho `PATCH /users/me/email` - đổi Email đăng nhập của CHÍNH MÌNH.
 * Gate riêng bằng permission `profile.edit_email` (mặc định CHỈ Admin - xem
 * migration `AddUserSoftDeleteAndProfilePermissions`), tách khỏi
 * `profile.edit_info` vì đổi Email đồng nghĩa đổi định danh đăng nhập -
 * BẮT BUỘC nhập lại mật khẩu hiện tại để xác nhận, giống hệt lý do
 * `ChangePasswordDto` yêu cầu `currentPassword` (hành động nhạy cảm, không
 * dựa hoàn toàn vào JWT còn hiệu lực).
 */
export class UpdateOwnEmailDto {
  @ApiProperty({ example: 'new-email@azworkbase.com' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiProperty({ example: 'MatKhauHienTai@123' })
  @IsString()
  @MinLength(1, { message: 'Vui lòng nhập mật khẩu hiện tại để xác nhận' })
  currentPassword: string;
}
