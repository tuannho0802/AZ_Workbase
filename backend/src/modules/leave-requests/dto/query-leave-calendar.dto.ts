import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Query cho Lịch tháng nghỉ phép: `GET /leave-requests/mine/calendar` và
 * `GET /leave-requests/calendar`. Không phân trang - FE luôn xin đúng khoảng
 * ngày của lưới lịch đang xem (tối đa ~6 tuần, BE chặn quá 45 ngày).
 * ValidationPipe global bật forbidNonWhitelisted nên FE KHÔNG được gửi field lạ.
 */
export class QueryLeaveCalendarDto {
  @ApiProperty({ description: "Ngày đầu khoảng cần xem 'YYYY-MM-DD'." })
  @Matches(YMD, { message: 'fromDate phải theo định dạng YYYY-MM-DD' })
  fromDate: string;

  @ApiProperty({ description: "Ngày cuối khoảng cần xem 'YYYY-MM-DD' (tối đa 45 ngày sau fromDate)." })
  @Matches(YMD, { message: 'toDate phải theo định dạng YYYY-MM-DD' })
  toDate: string;

  @ApiProperty({ required: false, description: 'Lọc theo phòng ban của người xin nghỉ (chỉ /calendar).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  departmentId?: number;

  @ApiProperty({ required: false, description: 'Lọc theo mã loại phép (leave_types.code).' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  leaveType?: string;
}
