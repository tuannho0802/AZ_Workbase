import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO cho `PATCH /users/me/password` - tự đổi mật khẩu CHÍNH MÌNH. Khác
 * `ResetPasswordDto` (Admin/Assistant/Manager đặt lại mật khẩu CHO NGƯỜI
 * KHÁC, không cần biết mật khẩu cũ) - ở đây BẮT BUỘC `currentPassword` để
 * xác thực lại chính chủ trước khi đổi (yêu cầu chủ dự án: "Cần xác nhận 2
 * lần" - hiểu là (1) xác nhận bằng mật khẩu hiện tại + (2) nhập mật khẩu mới
 * 2 lần khớp nhau, validate lại `confirmNewPassword` ở tầng Service dù FE đã
 * tự so khớp - không tin tưởng riêng FE cho hành động nhạy cảm).
 */
export class ChangePasswordDto {
  @ApiProperty({ example: 'MatKhauCu@123' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'MatKhauMoi@123' })
  @IsString()
  @MinLength(6, { message: 'Mật khẩu mới phải có ít nhất 6 ký tự' })
  newPassword: string;

  @ApiProperty({ example: 'MatKhauMoi@123' })
  @IsString()
  confirmNewPassword: string;
}
