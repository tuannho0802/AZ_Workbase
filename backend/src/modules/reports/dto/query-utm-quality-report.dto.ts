import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { QueryReportDto } from './query-report.dto';

export const UTM_QUALITY_STATES = ['all', 'active', 'locked'] as const;
export type UtmQualityState = (typeof UTM_QUALITY_STATES)[number];

/**
 * Query báo cáo CHẤT LƯỢNG UTM = kỳ (kế thừa QueryReportDto) + bộ lọc tuỳ chọn.
 * ValidationPipe đang bật `forbidNonWhitelisted` nên MỌI query param phải khai báo ở đây.
 * `salesUserId=0` / `marketingUserId=0` = "chưa gán" (IS NULL), cùng quy ước QueryMarketingReportDto.
 */
export class QueryUtmQualityReportDto extends QueryReportDto {
  @ApiPropertyOptional({
    enum: UTM_QUALITY_STATES,
    default: 'all',
    description: 'Tất cả UTM / chỉ UTM đang hoạt động (is_active=1) / chỉ UTM đã khoá (is_active=0).',
  })
  @IsOptional()
  @IsIn(UTM_QUALITY_STATES as unknown as string[])
  state?: UtmQualityState;

  @ApiPropertyOptional({ description: 'Chỉ xem 1 UTM cụ thể (utms.id).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  utmId?: number;

  @ApiPropertyOptional({ description: 'Chỉ tính khách do 1 Sales phụ trách (user id). 0 = chưa có Sales.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salesUserId?: number;

  @ApiPropertyOptional({ description: 'Chỉ tính khách do 1 Marketing phụ trách (user id). 0 = chưa gán.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  marketingUserId?: number;
}
