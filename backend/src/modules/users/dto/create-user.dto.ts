import { IsEmail, IsString, IsInt, IsOptional, MinLength, Matches, IsBoolean } from 'class-validator';
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
  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự' })
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    { message: 'Mật khẩu phải có chữ hoa, chữ thường, số và ký tự đặc biệt' }
  )
  password: string;

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

  @ApiProperty({ example: true, default: true, required: false })
  @IsOptional()
  @IsBoolean({ message: 'Trạng thái phải là kiểu boolean' })
  isActive?: boolean;

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