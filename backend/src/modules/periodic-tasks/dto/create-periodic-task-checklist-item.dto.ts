import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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

  @ApiPropertyOptional({
    example: true,
    description:
      'Chỉ có tác dụng khi Task ĐÃ HOÀN THÀNH: true = mở lại (status -> in_progress, kỳ đã qua thì kéo period_end tới hôm nay).',
  })
  @IsOptional()
  @IsBoolean({ message: 'reopen phải là boolean' })
  reopen?: boolean;
}
