import { IsBoolean, IsNumber, Min, IsDateString, IsArray, ArrayMinSize, ArrayMaxSize, IsOptional, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAuditSettingsDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  retentionDays: number;
}

export class CleanupAuditLogsDto {
  @ApiProperty()
  @IsDateString()
  from: string;

  @ApiProperty()
  @IsDateString()
  to: string;
}

export class BulkDeleteAuditLogsDto {
  @ApiProperty()
  @IsArray()
  @IsNumber({}, { each: true })
  ids: number[];
}

/** PLAN_RETENTION Phase 2 (A2): 1 khoảng ngày VN, định dạng chặt `YYYY-MM-DD` (FE gửi dayjs.format, không toISOString). */
export class DateRangeDto {
  @ApiProperty({ example: '2026-01-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from phải có dạng YYYY-MM-DD' })
  from: string;

  @ApiProperty({ example: '2026-01-31' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to phải có dạng YYYY-MM-DD' })
  to: string;
}

/** Dùng chung cho `POST /audit-logs/cleanup-ranges` và `POST /periodic-tasks/audit-logs/cleanup-ranges`. */
export class CleanupRangesDto {
  @ApiProperty({ type: [DateRangeDto], description: 'Tối đa 20 khoảng' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DateRangeDto)
  ranges: DateRangeDto[];

  @ApiProperty({ required: false, description: 'Chỉ có nghĩa với audit_logs: true = xoá cả sự kiện bảo mật (mặc định giữ lại)' })
  @IsOptional()
  @IsBoolean()
  includeSecurityEvents?: boolean;
}
