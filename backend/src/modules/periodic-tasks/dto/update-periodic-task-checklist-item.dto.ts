import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, IsNotEmpty } from 'class-validator';
import { CHECKLIST_NEXT_STATUS_CODES } from '../helpers/task-status.helper';
import type { ChecklistNextStatusCode } from '../helpers/task-status.helper';

/**
 * UpdatePeriodicTaskChecklistItemDto - body của
 * `PATCH /periodic-tasks/:id/checklist-items/:itemId` (PLAN mục 6, Phase 6).
 * KHÔNG dùng `PartialType(Create...)` như `UpdatePeriodicTaskDto` vì cần
 * thêm field `isDone` (không có ở DTO tạo mới) - viết tay riêng cho rõ ràng.
 */
export class UpdatePeriodicTaskChecklistItemDto {
  @ApiPropertyOptional({ example: 'Gọi điện xác nhận lịch hẹn (đã đổi giờ)', description: 'Nội dung mới' })
  @IsOptional()
  @IsNotEmpty({ message: 'Nội dung không được để trống' })
  @IsString({ message: 'Nội dung phải là chuỗi' })
  @MaxLength(500, { message: 'Nội dung tối đa 500 ký tự' })
  content?: string;

  @ApiPropertyOptional({ example: true, description: 'Đánh dấu xong/chưa xong' })
  @IsOptional()
  @IsBoolean({ message: 'isDone phải là boolean' })
  isDone?: boolean;

  @ApiPropertyOptional({
    enum: CHECKLIST_NEXT_STATUS_CODES,
    description: 'Chỉ dùng khi tick (isDone=true): BE đổi status Task NGAY trong request này (chỉ tiến lên, không hạ).',
  })
  @IsOptional()
  @IsIn(CHECKLIST_NEXT_STATUS_CODES, { message: 'nextStatusCode phải là "in_progress" hoặc "in_review"' })
  nextStatusCode?: ChecklistNextStatusCode;
}
