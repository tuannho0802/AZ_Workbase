import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import {
  NOTIFICATION_UNREAD_DAYS_MIN,
  RETENTION_INTERVAL_MAX,
  RETENTION_INTERVAL_MIN,
  RETENTION_TARGETS,
} from '../retention.constants';

export class RetentionTargetSettingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Số ngày giữ (tối thiểu 7).' })
  @IsOptional()
  @IsInt()
  @Min(7)
  retentionDays?: number;
}

export class RetentionNotificationSettingDto extends RetentionTargetSettingDto {
  @ApiPropertyOptional({ description: 'Số ngày giữ thông báo CHƯA ĐỌC (tối thiểu 30).' })
  @IsOptional()
  @IsInt()
  @Min(NOTIFICATION_UNREAD_DAYS_MIN)
  unreadRetentionDays?: number;
}

export class RetentionAttendanceSettingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Dữ liệu chấm công: tối thiểu 365 ngày.' })
  @IsOptional()
  @IsInt()
  @Min(365)
  retentionDays?: number;
}

export class UpdateRetentionSettingsDto {
  @ApiPropertyOptional({ description: `Chu kỳ chạy (ngày), ${RETENTION_INTERVAL_MIN}–${RETENTION_INTERVAL_MAX}.` })
  @IsOptional()
  @IsInt()
  @Min(RETENTION_INTERVAL_MIN)
  @Max(RETENTION_INTERVAL_MAX)
  intervalDays?: number;

  @ApiPropertyOptional({ type: RetentionTargetSettingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RetentionTargetSettingDto)
  auditLogs?: RetentionTargetSettingDto;

  @ApiPropertyOptional({ type: RetentionTargetSettingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RetentionTargetSettingDto)
  taskAuditLogs?: RetentionTargetSettingDto;

  @ApiPropertyOptional({ type: RetentionNotificationSettingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RetentionNotificationSettingDto)
  notifications?: RetentionNotificationSettingDto;

  @ApiPropertyOptional({ type: RetentionAttendanceSettingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RetentionAttendanceSettingDto)
  attendanceLogs?: RetentionAttendanceSettingDto;
}

export class RetentionRunNowDto {
  @ApiPropertyOptional({ enum: RETENTION_TARGETS, description: 'Bỏ trống = tất cả đối tượng đang bật.' })
  @IsOptional()
  @IsIn(RETENTION_TARGETS)
  target?: (typeof RETENTION_TARGETS)[number];

  @ApiPropertyOptional({ description: "'true' = chỉ đếm số dòng sẽ xoá, không xoá." })
  @IsOptional()
  @IsIn(['true', 'false'])
  dryRun?: string;
}
