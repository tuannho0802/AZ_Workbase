import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RejectUserDto {
  @ApiPropertyOptional({ example: 'Không xác định được danh tính người đăng ký' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
