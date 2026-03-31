import { IsEmail, IsString, IsEnum, IsInt, IsOptional, MinLength, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiProperty({ example: 'Nguyễn Văn A', required: false })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Tên phải có ít nhất 2 ký tự' })
  name?: string;

  @ApiProperty({ enum: ['admin', 'manager', 'assistant', 'employee'], required: false })
  @IsOptional()
  @IsEnum(['admin', 'manager', 'assistant', 'employee'])
  role?: string;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  departmentId?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
