import { IsOptional, IsInt, Matches, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

const DATE_MSG = 'Ngày phải có dạng YYYY-MM-DD';

export class UtmStatsQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01', description: 'Từ ngày nhập khách (YYYY-MM-DD, giờ VN). Mặc định: 30 ngày gần nhất.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MSG })
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Đến ngày nhập khách (YYYY-MM-DD, giờ VN). Mặc định: hôm nay.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MSG })
  to?: string;

  @ApiPropertyOptional({ example: 3, description: 'Chỉ thống kê 1 UTM (phải nằm trong phạm vi utms.view của người xem).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  utmId?: number;
}
