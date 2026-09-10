import { Type } from 'class-transformer';
import { IsString, IsOptional, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Query params dùng chung cho GET (đọc rule ở đúng 1 scope) và DELETE (reset
 * đúng 1 scope) - `departmentId`/`positionId` là optional, KHÔNG được truyền
 * cả hai cùng lúc (validate ở `UiVisibilityService`). Không truyền gì cả =
 * scope Toàn cục (global).
 */
export class UiVisibilityScopeQueryDto {
  @ApiProperty({ example: 'customers' })
  @IsString()
  resource: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  positionId?: number;
}
