import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { QueryReportDto } from './query-report.dto';

/**
 * Query báo cáo CHẤT LƯỢNG NHÓM = kỳ (kế thừa QueryReportDto) + 2 bộ lọc tuỳ chọn.
 * ValidationPipe đang bật `forbidNonWhitelisted` nên MỌI query param phải khai báo ở đây.
 */
export class QueryGroupQualityReportDto extends QueryReportDto {
  @ApiPropertyOptional({ description: 'Chỉ xem 1 nhóm cụ thể (link_groups.id) - biểu đồ/nguồn/Sales/xu hướng theo đúng nhóm đó.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  groupId?: number;

  @ApiPropertyOptional({ description: 'Chỉ xem các nhóm thuộc 1 Category/nền tảng (link_categories.id).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;
}
