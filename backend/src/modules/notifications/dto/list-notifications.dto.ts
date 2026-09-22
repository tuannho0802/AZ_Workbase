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

export const NOTIFICATION_CATEGORY_VALUES = [
  'customer',
  'task',
  'manual',
] as const;

export class ListNotificationsDto {
  @ApiPropertyOptional({
    description: 'Cursor opaque từ `nextCursor` của trang trước',
  })
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

  @ApiPropertyOptional({ description: 'Chỉ lấy thông báo chưa đọc' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional({
    description:
      'true = CHỈ lấy thông báo ĐÃ ẨN (dismissedAt khác NULL, chỉ thông báo thủ công mới có trạng thái này - xem `remove()`); mặc định (false/không truyền) = lấy thông báo đang hiện như cũ.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  dismissed?: boolean;

  @ApiPropertyOptional({ enum: NOTIFICATION_CATEGORY_VALUES })
  @IsOptional()
  @IsIn(NOTIFICATION_CATEGORY_VALUES as unknown as string[])
  category?: 'customer' | 'task' | 'manual';
}

export class ReadAllNotificationsDto {
  @ApiPropertyOptional({ enum: NOTIFICATION_CATEGORY_VALUES })
  @IsOptional()
  @IsIn(NOTIFICATION_CATEGORY_VALUES as unknown as string[])
  category?: 'customer' | 'task' | 'manual';
}