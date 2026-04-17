import { IsBoolean, IsNumber, Min, IsDateString, IsArray } from 'class-validator';
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
