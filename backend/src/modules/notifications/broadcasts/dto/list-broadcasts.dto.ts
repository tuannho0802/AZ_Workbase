import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Cursor pagination - mirror `ListNotificationsDto` (mục 6.5 PLAN). */
export class ListBroadcastsDto {
  @ApiPropertyOptional({ description: 'Cursor opaque từ `nextCursor` trang trước' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export const BROADCAST_RECIPIENT_STATUS = ['all', 'read', 'unread'] as const;

export class ListBroadcastRecipientsDto {
  @ApiPropertyOptional({ enum: BROADCAST_RECIPIENT_STATUS, default: 'all' })
  @IsOptional()
  @IsIn(BROADCAST_RECIPIENT_STATUS as unknown as string[])
  status?: (typeof BROADCAST_RECIPIENT_STATUS)[number];

  @ApiPropertyOptional({ description: 'Tìm theo tên người nhận' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cursor?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Chỉ dùng nội bộ - không mở cho FE' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  includeDismissed?: boolean;
}
