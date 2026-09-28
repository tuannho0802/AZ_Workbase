import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { QueryReportDto } from './query-report.dto';

/**
 * Query báo cáo Marketing = kỳ (kế thừa QueryReportDto) + 4 bộ lọc tuỳ chọn.
 * `marketingUserId=0` / `createdById=0` là giá trị ĐẶC BIỆT = "chưa gán" (IS NULL).
 * ValidationPipe đang bật `forbidNonWhitelisted` nên MỌI query param phải khai báo ở đây.
 */
export class QueryMarketingReportDto extends QueryReportDto {
  @ApiPropertyOptional({ description: 'Lọc theo Marketing phụ trách (user id). 0 = chưa gán Marketing.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  marketingUserId?: number;

  @ApiPropertyOptional({ description: 'Lọc theo người tạo data (user id). 0 = không rõ người tạo.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  createdById?: number;

  @ApiPropertyOptional({ description: 'Lọc theo phòng ban CỦA KHÁCH HÀNG (không phải phòng ban nhân viên).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  departmentId?: number;

  @ApiPropertyOptional({ description: 'Lọc theo nguồn khách (media_sources.name).' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;
}
