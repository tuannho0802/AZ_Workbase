import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  ValidateIf,
} from 'class-validator';

export const BROADCAST_AUDIENCE_TYPES = ['USERS', 'DEPARTMENTS', 'ALL'] as const;
export type BroadcastAudienceType = (typeof BROADCAST_AUDIENCE_TYPES)[number];

/** Trần theo PLAN mục 6.7 - chống payload khổng lồ / lạm dụng. */
export const BROADCAST_MAX_USER_IDS = 500;
export const BROADCAST_MAX_DEPARTMENT_IDS = 50;

/**
 * Đối tượng người nhận do người gửi CHỌN (chưa phải danh sách cuối cùng) -
 * BE luôn resolve + kiểm scope lại (`BroadcastAudienceResolver`), KHÔNG tin
 * `userIds` gửi lên (PLAN nguyên tắc 5).
 */
export class BroadcastAudienceDto {
  @ApiProperty({ enum: BROADCAST_AUDIENCE_TYPES })
  @IsIn(BROADCAST_AUDIENCE_TYPES)
  type: BroadcastAudienceType;

  @ApiProperty({ required: false, type: [Number] })
  @ValidateIf((o) => o.type === 'USERS')
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(BROADCAST_MAX_USER_IDS)
  @IsInt({ each: true })
  @Type(() => Number)
  userIds?: number[];

  @ApiProperty({ required: false, type: [Number] })
  @ValidateIf((o) => o.type === 'DEPARTMENTS')
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(BROADCAST_MAX_DEPARTMENT_IDS)
  @IsInt({ each: true })
  @Type(() => Number)
  departmentIds?: number[];
}
