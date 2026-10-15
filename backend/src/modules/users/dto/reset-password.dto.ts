import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsPolicyPassword } from '../../../common/validators/password-policy';

export class ResetPasswordDto {
  @ApiProperty({ example: 'NewPassword@123' })
  // [AGENT] OLD CODE: @IsString() @MinLength(8) @Matches(regex) - gom về password-policy.ts (C1)
  @IsPolicyPassword()
  newPassword: string;

  // P6: bỏ trống/null = mật khẩu KHÔNG hết hạn. Sau reset luôn bắt buộc đổi ở lần đăng nhập kế tiếp.
  @ApiPropertyOptional({ example: 90, nullable: true, description: 'Hạn mật khẩu (ngày); null/bỏ trống = vô hạn' })
  @IsOptional()
  @IsInt({ message: 'Hạn mật khẩu phải là số nguyên (ngày)' })
  @Min(1, { message: 'Hạn mật khẩu tối thiểu 1 ngày' })
  @Max(365, { message: 'Hạn mật khẩu tối đa 365 ngày' })
  passwordExpiryDays?: number | null;
}
