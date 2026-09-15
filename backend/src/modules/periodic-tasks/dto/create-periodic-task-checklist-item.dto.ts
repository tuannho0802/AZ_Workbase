import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * CreatePeriodicTaskChecklistItemDto - body của
 * `POST /periodic-tasks/:id/checklist-items` (PLAN mục 6, Phase 6).
 * Item mới luôn thêm vào CUỐI danh sách - `position` do Service tự tính
 * (MAX hiện tại + 1), không nhận từ client để tránh đụng độ thứ tự.
 */
export class CreatePeriodicTaskChecklistItemDto {
  @ApiProperty({ example: 'Gọi điện xác nhận lịch hẹn', description: 'Nội dung checklist item' })
  @IsNotEmpty({ message: 'Nội dung không được để trống' })
  @IsString({ message: 'Nội dung phải là chuỗi' })
  @MaxLength(500, { message: 'Nội dung tối đa 500 ký tự' })
  content: string;
}
