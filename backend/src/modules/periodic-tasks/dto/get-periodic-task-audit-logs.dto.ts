import { IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * GetPeriodicTaskAuditLogsDto - Phase 7 (PLAN mục 5): phân trang cho
 * `GET /periodic-tasks/:id/audit-logs`. Đơn giản hơn `GetAuditLogsDto`
 * (`audit` module chung) vì đã có `:id` trên path để lọc theo Task - không
 * cần thêm filter `entityType`/`action`/`search` ở đây, chỉ cần phân trang.
 */
export class GetPeriodicTaskAuditLogsDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20, description: 'Tối đa 100/trang' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
