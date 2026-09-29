import { IsString, IsNotEmpty, Length, IsOptional, IsIn, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUtmDto {
  @ApiProperty({ example: 'FB_Q4', description: 'Tên UTM (duy nhất, không phân biệt hoa/thường và dấu)' })
  @IsString()
  @IsNotEmpty({ message: 'Tên UTM là bắt buộc' })
  @Length(1, 100, { message: 'Tên UTM tối đa 100 ký tự' })
  name: string;

  @ApiPropertyOptional({ example: 'Chiến dịch Facebook quý 4' })
  @IsOptional()
  @IsString()
  @Length(0, 255, { message: 'Mô tả tối đa 255 ký tự' })
  description?: string | null;

  @ApiPropertyOptional({ example: '#1677ff' })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Màu phải có dạng #RRGGBB' })
  color?: string;

  @ApiPropertyOptional({ enum: ['shared', 'restricted'], default: 'shared' })
  @IsOptional()
  @IsIn(['shared', 'restricted'], { message: 'visibility chỉ nhận shared hoặc restricted' })
  visibility?: 'shared' | 'restricted';
}
