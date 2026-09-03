import { IsIn, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ReportPeriodType } from '../../../common/utils/date-vn.util';

export class QueryReportDto {
  @ApiProperty({
    enum: ['week', 'month', 'quarter', 'year', 'custom'],
    description:
      'Loại khoảng thời gian - LUÔN tính theo mốc lịch TRỌN VẸN (Thứ Hai->Chủ Nhật, ngày 1->cuối tháng...), KHÔNG phải "N ngày gần đây". period=custom bắt buộc phải kèm customFrom/customTo.',
  })
  @IsIn(['week', 'month', 'quarter', 'year', 'custom'])
  period: ReportPeriodType;

  @ApiPropertyOptional({
    description:
      'Mốc ngày (YYYY-MM-DD) để xác định TUẦN/THÁNG/QUÝ/NĂM nào - vd anchor=2026-08-15 với period=month sẽ tính trọn tháng 8/2026. Mặc định = hôm nay (giờ VN) nếu không truyền. Bỏ qua khi period=custom.',
  })
  @IsOptional()
  @IsDateString()
  anchor?: string;

  @ApiPropertyOptional({ description: 'Bắt buộc khi period=custom - ngày bắt đầu (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  customFrom?: string;

  @ApiPropertyOptional({ description: 'Bắt buộc khi period=custom - ngày kết thúc (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  customTo?: string;
}