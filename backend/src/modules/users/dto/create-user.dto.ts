import { IsEmail, IsString, IsInt, IsOptional, MinLength, Matches, IsBoolean, Max, Min } from 'class-validator';
import { IsPolicyPassword } from '../../../common/validators/password-policy';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'user@azworkbase.com' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString({ message: 'Tên phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tên phải có ít nhất 2 ký tự' })
  name: string;

  @ApiProperty({ example: '0901234567', required: false })
  @IsOptional()
  @Matches(/^(09|08|07|03|05)[0-9]{8}$/, {
    message: 'Số điện thoại không hợp lệ',
  })
  phone?: string;

  @ApiProperty({ 
    example: 'Password@123',
    description: 'Mật khẩu (ít nhất 8 ký tự, có chữ hoa, chữ thường, số, ký tự đặc biệt)'
  })
  // [AGENT] OLD CODE: @IsString() @MinLength(8) @Matches(regex) - gom về password-policy.ts (C1)
  @IsPolicyPassword()
  password: string;

  // P6: tài khoản do người khác tạo luôn bị buộc đổi mật khẩu ở lần đăng nhập đầu. Bỏ trống/null = vô hạn.
  @ApiProperty({ example: 90, required: false, nullable: true, description: 'Hạn mật khẩu (ngày); null/bỏ trống = vô hạn' })
  @IsOptional()
  @IsInt({ message: 'Hạn mật khẩu phải là số nguyên (ngày)' })
  @Min(1, { message: 'Hạn mật khẩu tối thiểu 1 ngày' })
  @Max(365, { message: 'Hạn mật khẩu tối đa 365 ngày' })
  passwordExpiryDays?: number | null;

  // ⚠️ FIX BUG THẬT (400 "role must be one of the following values" khi gán
  // role tuỳ chỉnh) - xem giải thích đầy đủ ở update-user.dto.ts. Chỉ
  // validate ĐỊNH DẠNG ở đây, tồn tại hay không do UsersService kiểm tra qua
  // bảng `roles`.
  @ApiProperty({
    example: 'employee',
    description: 'Mã role (khớp `roles.code`) - có thể là 1 trong 4 role hệ thống hoặc role tuỳ chỉnh Admin đã tạo',
  })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]*$/, { message: 'Mã role không hợp lệ' })
  role: string;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt({ message: 'ID phòng ban phải là số nguyên' })
  departmentId?: number;

  // ⚠️ MỚI - Vị trí (Position), tuỳ chọn, KHÔNG bắt buộc (xem PLAN mục 2.6).
  // Không tồn tại -> DB tự chặn qua FK `fk_users_position` (giống cách
  // departmentId đang dựa vào FK, không check existence riêng ở service).
  @ApiProperty({ example: 1, required: false, nullable: true, description: 'ID vị trí (Position), tuỳ chọn' })
  @IsOptional()
  @IsInt({ message: 'ID vị trí phải là số nguyên' })
  positionId?: number | null;

  @ApiProperty({ example: true, default: true, required: false })
  @IsOptional()
  @IsBoolean({ message: 'Trạng thái phải là kiểu boolean' })
  isActive?: boolean;

  // ⚠️ MỚI (migration AddIsRootAdminToUsers1781000000000) - CHỈ validate
  // ĐỊNH DẠNG ở đây. `UsersService.create()` mới là nơi enforce THẬT: chỉ
  // Root Admin hiện tại (role=admin && isRootAdmin=true) mới được set field
  // này, và chỉ role='admin' mới được là Root Admin - xem JSDoc ở đó.
  @ApiProperty({
    example: false,
    default: false,
    required: false,
    description: 'Root Admin - CHỈ Root Admin hiện tại mới được set field này khi tạo nhân viên mới',
  })
  @IsOptional()
  @IsBoolean({ message: 'isRootAdmin phải là kiểu boolean' })
  isRootAdmin?: boolean;

  @ApiProperty({
    example: 'AZ042',
    required: false,
    description: 'Mã nhân viên - bỏ trống để hệ thống tự sinh (AZ001, AZ002... tăng dần)',
  })
  @IsOptional()
  @IsString({ message: 'Mã nhân viên phải là chuỗi ký tự' })
  @Matches(/^[A-Za-z0-9\-_]{1,20}$/, {
    message: 'Mã nhân viên chỉ gồm chữ, số, gạch ngang/gạch dưới, tối đa 20 ký tự',
  })
  employeeCode?: string;
}