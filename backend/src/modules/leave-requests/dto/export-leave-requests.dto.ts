import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { QueryLeaveStatsDto } from './query-leave-stats.dto';

export const LEAVE_EXPORT_FORMS = ['A', 'B', 'C', 'D', 'F'] as const;

/**
 * Body của `POST /leave-requests/export[/preview]` = kỳ + bộ lọc của tab Thống kê (kế thừa
 * QueryLeaveStatsDto) + `form` muốn xuất. ValidationPipe global bật forbidNonWhitelisted nên MỌI
 * field phải khai ở đây. Form E (kèm biểu đồ) thuộc phase L5 nên chưa nhận.
 */
export class ExportLeaveRequestsDto extends QueryLeaveStatsDto {
  @ApiProperty({
    enum: LEAVE_EXPORT_FORMS,
    description:
      'A=Tổng hợp theo nhân viên, B=Chi tiết từng đơn, C=Theo phòng ban & loại phép, D=Ma trận nhân viên × thời gian, F=Gói đầy đủ (A-D).',
  })
  @IsIn(LEAVE_EXPORT_FORMS as unknown as string[])
  form: (typeof LEAVE_EXPORT_FORMS)[number];
}
