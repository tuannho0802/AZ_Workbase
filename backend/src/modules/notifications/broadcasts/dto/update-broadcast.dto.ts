import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

/**
 * Sửa 1 lần gửi ĐÃ TỒN TẠI (yêu cầu chủ dự án - mở rộng so với PLAN v2 gốc:
 * v2 chưa có edit). KHÔNG cho đổi đối tượng người nhận sau khi đã gửi - người
 * nhận đã được CHỐT (snapshot) tại thời điểm gửi (PLAN nguyên tắc 12); sửa chỉ
 * áp dụng cho nội dung (`title`/`body`), người nhận cũ vẫn thấy đúng nhóm đó,
 * chỉ nội dung thay đổi + nhãn "Đã chỉnh sửa".
 */
export class UpdateBroadcastDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  body?: string;
}
