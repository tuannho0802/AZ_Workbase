import { IsString, IsNotEmpty, Length, IsOptional, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMediaSourceDto {
  @ApiProperty({ example: 'Zalo', description: 'Tên nguồn (duy nhất, hiển thị trong dropdown Nguồn khi thêm khách hàng)' })
  @IsString()
  @IsNotEmpty({ message: 'Tên nguồn là bắt buộc' })
  @Length(1, 100, { message: 'Tên nguồn tối đa 100 ký tự' })
  name: string;

  @ApiPropertyOptional({ example: 0, description: 'Thứ tự hiển thị (nhỏ hơn hiện trước), mặc định 0' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sortOrder?: number;
}
