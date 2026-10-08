import { IsOptional, IsString, IsInt, Min, Max, IsBoolean, Length } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UtmQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên (không phân biệt hoa/thường và dấu)' })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  q?: string;

  @ApiPropertyOptional({ description: 'true = chỉ UTM đang hoạt động' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  activeOnly?: boolean;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  /** Khoá phiên bản cache do FE gắn (xem frontend/src/lib/api/ref-cache-version.ts) - BE không dùng giá trị, chỉ để qua ValidationPipe whitelist. */
  @IsOptional()
  @IsString()
  v?: string;
}
