import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayMinSize, ArrayUnique, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * ReorderPeriodicTaskChecklistItemsDto - body của
 * `PATCH /periodic-tasks/:id/checklist-items/reorder` (PLAN mục 6, Phase 6).
 *
 * `itemIds` PHẢI là hoán vị ĐẦY ĐỦ (không thiếu/thừa) của toàn bộ checklist
 * item hiện có của Task - Service validate tập hợp khớp 1-1 trước khi ghi
 * `position` mới theo đúng thứ tự trong mảng (index 0 -> position 0, ...).
 * Chọn "gửi lại toàn bộ thứ tự" thay vì "đổi chỗ 2 item" vì khớp đúng UX kéo-
 * thả (drag-and-drop) kiểu Trello ở FE - client luôn có sẵn thứ tự mới đầy đủ
 * sau khi kéo-thả xong.
 */
export class ReorderPeriodicTaskChecklistItemsDto {
  @ApiProperty({
    example: [3, 1, 2],
    description: 'Thứ tự ID checklist item MỚI - phải là hoán vị đầy đủ của các item hiện có trong Task',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Phải có ít nhất 1 item để sắp xếp lại' })
  @ArrayUnique({ message: 'itemIds không được trùng lặp' })
  @IsInt({ each: true })
  @Type(() => Number)
  itemIds: number[];
}
