import { IsEmail, IsString, IsEnum, IsInt, IsOptional, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'user@azworkbase.com' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @MinLength(2, { message: 'Tên phải có ít nhất 2 ký tự' })
  name: string;

  @ApiProperty({ 
    example: 'Password@123',
    description: 'Mật khẩu (ít nhất 8 ký tự, có chữ hoa, chữ thường, số, ký tự đặc biệt)'
  })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    { message: 'Mật khẩu phải có chữ hoa, chữ thường, số và ký tự đặc biệt' }
  )
  password: string;

  @ApiProperty({ enum: ['admin', 'manager', 'assistant', 'employee'] })
  @IsEnum(['admin', 'manager', 'assistant', 'employee'])
  role: string;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  departmentId?: number;
}
