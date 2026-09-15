import { IsOptional, IsNumber, IsString, IsDateString, IsArray, Min, Max } from 'class-validator';
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

/**
 * GetPeriodicTaskAuditLogsGlobalDto - trang riêng "Lịch sử Công việc định kỳ"
 * (mirror `GetAuditLogsDto` của module `audit` chung, xem `audit.controller.ts`)
 * cho `GET /periodic-tasks/audit-logs` - KHÁC `GetPeriodicTaskAuditLogsDto` ở
 * chỗ không có `:id` trên path nên cần đủ bộ filter (taskId/userId/action/
 * khoảng ngày/tìm theo tên Task hoặc người thực hiện) để lọc trên toàn bộ
 * log của MỌI Task trong phạm vi scope người xem.
 */
export class GetPeriodicTaskAuditLogsGlobalDto {
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

  @ApiProperty({ required: false, description: 'Lọc theo 1 Task cụ thể' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  taskId?: number;

  @ApiProperty({ required: false, description: 'Lọc theo người thực hiện hành động' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  userId?: number;

  @ApiProperty({ required: false, description: 'Lọc theo action (created/updated/status_changed...)' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiProperty({ required: false, description: 'Từ ngày (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiProperty({ required: false, description: 'Đến ngày (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiProperty({ required: false, description: 'Tìm theo tên Task hoặc tên người thực hiện' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class BulkDeletePeriodicTaskAuditLogsDto {
  @ApiProperty()
  @IsArray()
  @IsNumber({}, { each: true })
  ids: number[];
}

export class CleanupPeriodicTaskAuditLogsDto {
  @ApiProperty()
  @IsDateString()
  from: string;

  @ApiProperty()
  @IsDateString()
  to: string;
}