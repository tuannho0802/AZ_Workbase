import { IsOptional, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SyncAttendanceDto {
  @ApiPropertyOptional({
    example: '2026-08-01',
    description:
      'Chỉ đồng bộ log TỪ ngày này (YYYY-MM-DD, tính từ 00:00:00). Bỏ trống = không giới hạn đầu (đồng bộ từ log cũ nhất).',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-08-26',
    description:
      'Chỉ đồng bộ log ĐẾN ngày này (YYYY-MM-DD, bao gồm cả ngày - tính đến 23:59:59). Bỏ trống = không giới hạn cuối (đồng bộ tới log mới nhất).',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
