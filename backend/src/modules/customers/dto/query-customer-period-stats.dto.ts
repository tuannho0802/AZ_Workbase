import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const CUSTOMER_STATS_PERIODS = ['day', 'week', 'month', 'year'] as const;
export type CustomerStatsPeriod = (typeof CUSTOMER_STATS_PERIODS)[number];

export class QueryCustomerPeriodStatsDto {
  @ApiProperty({
    enum: CUSTOMER_STATS_PERIODS,
    description:
      'Giai đoạn thống kê - LUÔN là mốc lịch TRỌN VẸN (ngày / Thứ Hai->CN / ngày 1->cuối tháng / 1/1->31/12) chứa `anchor`.',
  })
  @IsIn(CUSTOMER_STATS_PERIODS as unknown as string[])
  period: CustomerStatsPeriod;

  @ApiPropertyOptional({ description: 'Mốc ngày YYYY-MM-DD (giờ VN). Mặc định = hôm nay.' })
  @IsOptional()
  @IsDateString()
  anchor?: string;
}
