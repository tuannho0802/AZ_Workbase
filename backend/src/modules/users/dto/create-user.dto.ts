import { IsEmail, IsString, IsEnum, IsInt, IsOptional, MinLength, Matches, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'user@azworkbase.com' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString({ message: 'Tên phải là chuỗi ký tự' })
  @MinLength(2, { message: 'Tên phải có ít nhất 2 ký tự' })
  name: string;

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

  @ApiProperty({ 
    enum: ['admin', 'manager', 'assistant', 'employee'],
    example: 'employee'
  })
  @IsEnum(['admin', 'manager', 'assistant', 'employee'], {
    message: 'Vai trò không hợp lệ'
  })
  role: string;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt({ message: 'ID phòng ban phải là số nguyên' })
  departmentId?: number;

  @ApiProperty({ example: true, default: true, required: false })
  @IsOptional()
  @IsBoolean({ message: 'Trạng thái phải là kiểu boolean' })
  isActive?: boolean;
}
