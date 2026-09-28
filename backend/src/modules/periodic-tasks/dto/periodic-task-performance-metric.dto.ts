import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsInt, IsOptional } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PeriodicTaskPerformanceFiltersDto } from './periodic-task-performance-filters.dto';

/** Card ở trang Hiệu suất -> tập Task tương ứng (mini table khi click Card). */
export enum PerformanceMetric {
  PRIMARY_TOTAL = 'primary_total',
  SECONDARY_TOTAL = 'secondary_total',
  COMPLETED = 'completed',
  COMPLETED_LATE = 'completed_late',
  OVERDUE = 'overdue',
  IN_PROGRESS = 'in_progress',
  IN_REVIEW = 'in_review',
  CHECKLIST_PRIMARY = 'checklist_primary',
  CHECKLIST_SECONDARY = 'checklist_secondary',
}

export class PeriodicTaskPerformanceMetricDto extends PeriodicTaskPerformanceFiltersDto {
  @ApiProperty({ enum: PerformanceMetric })
  @IsEnum(PerformanceMetric, { message: 'metric không hợp lệ' })
  metric: PerformanceMetric;

  @ApiPropertyOptional({ example: '3,5,9', description: 'Danh sách userId (CSV) - chỉ THU HẸP thêm trong scope, không nới scope' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').map((v) => Number(v.trim())).filter((n) => Number.isInteger(n) && n > 0) : value,
  )
  @IsArray()
  @IsInt({ each: true })
  userIds?: number[];

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;
}
