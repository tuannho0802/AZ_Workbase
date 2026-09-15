import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, IsNotEmpty } from 'class-validator';

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
}
