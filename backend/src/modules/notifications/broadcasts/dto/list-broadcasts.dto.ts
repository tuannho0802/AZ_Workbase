import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const BROADCAST_AUDIENCE_TYPES = ['USERS', 'DEPARTMENTS', 'ALL'] as const;

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

  @ApiPropertyOptional({ description: 'Tìm theo tiêu đề (LIKE, không phân biệt hoa/thường)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: BROADCAST_AUDIENCE_TYPES })
  @IsOptional()
  @IsIn(BROADCAST_AUDIENCE_TYPES as unknown as string[])
  audienceType?: (typeof BROADCAST_AUDIENCE_TYPES)[number];

  // ⚠️ Chỉ có ý nghĩa khi scope === 'all' (Admin) - `applyViewScope()` đã tự
  // khoá `senderId = callerId` cho scope 'own', truyền field này ở scope đó
  // không sai (kết hợp AND với chính điều kiện đó) nhưng vô nghĩa với UI.
  @ApiPropertyOptional({ description: 'Lọc theo người gửi - chỉ áp dụng khi scope=all' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  senderId?: number;

  @ApiPropertyOptional({ description: 'Từ ngày gửi (YYYY-MM-DD), theo createdAt' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Đến ngày gửi (YYYY-MM-DD), theo createdAt' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
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