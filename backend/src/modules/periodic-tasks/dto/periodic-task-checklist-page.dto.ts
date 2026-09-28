import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

/** Số dòng checklist TỐI ĐA mỗi trang trong modal (yêu cầu chủ dự án: tối đa 10). */
export const CHECKLIST_PAGE_SIZE = 10;

/**
 * Query phân trang cho 2 danh sách trong modal Checklist:
 * `GET /periodic-tasks/:id/checklist-items` và `GET /periodic-tasks/:id/linked-children-checklist`.
 * `limit` bị chặn cứng ở `CHECKLIST_PAGE_SIZE` - không thể xin nhiều hơn 10 dòng/lần.
 */
export class PeriodicTaskChecklistPageDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: CHECKLIST_PAGE_SIZE, description: `Tối đa ${CHECKLIST_PAGE_SIZE}` })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CHECKLIST_PAGE_SIZE)
  limit?: number = CHECKLIST_PAGE_SIZE;
}

/** Thứ tự hiển thị checklist item: `newest`/`oldest` = theo ngày tạo; bỏ trống = theo `position` (thứ tự tay). */
export const CHECKLIST_SORT_VALUES = ['newest', 'oldest'] as const;
export type ChecklistSort = (typeof CHECKLIST_SORT_VALUES)[number];

/**
 * Query riêng cho `GET /periodic-tasks/:id/checklist-items` = phân trang + sort + ẩn/hiện
 * item đã hoàn thành. Tách khỏi `PeriodicTaskChecklistPageDto` để endpoint Task con liên kết
 * (dùng chung DTO cơ sở) không nhận thêm tham số vô nghĩa.
 */
export class PeriodicTaskChecklistItemsQueryDto extends PeriodicTaskChecklistPageDto {
  @ApiPropertyOptional({ enum: CHECKLIST_SORT_VALUES, description: 'Bỏ trống = theo position (thứ tự tay)' })
  @IsOptional()
  @IsIn(CHECKLIST_SORT_VALUES, { message: 'sort phải là "newest" hoặc "oldest"' })
  sort?: ChecklistSort;

  @ApiPropertyOptional({ example: true, description: 'true = ẩn item đã hoàn thành' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value))
  @IsBoolean()
  hideDone?: boolean;
}

/** Body `PATCH /periodic-tasks/:id/checklist-items/:itemId/move` - đổi chỗ với item liền kề (xuyên trang). */
export class MovePeriodicTaskChecklistItemDto {
  @ApiProperty({ enum: ['up', 'down'] })
  @IsIn(['up', 'down'], { message: 'direction phải là "up" hoặc "down"' })
  direction: 'up' | 'down';
}
