import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsPolicyPassword } from '../../../common/validators/password-policy';

/** `POST /auth/change-password-required` - form 3 trường: mật khẩu được cấp / mật khẩu mới / nhập lại. */
export class ChangePasswordRequiredDto {
  @ApiProperty({ example: 'MatKhauDuocCap@1' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'MatKhauMoi@123' })
  @IsPolicyPassword()
  newPassword: string;

  @ApiProperty({ example: 'MatKhauMoi@123' })
  @IsString()
  confirmNewPassword: string;
}
