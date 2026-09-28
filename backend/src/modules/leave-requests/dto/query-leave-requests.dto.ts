import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Query chung cho 3 endpoint list dạng WEEK-MODE của Nghỉ phép:
 * `GET /leave-requests/mine/paged`, `/pending/paged`, `/history/paged`.
 * Mirror `GetAuditLogsDto` (page = trang TUẦN, weekStart/weekPage/weekLimit =
 * PHA 2 lazy-load 1 tuần). ValidationPipe global bật forbidNonWhitelisted nên
 * FE KHÔNG được gửi field lạ (vd `_t`).
 */
export class QueryLeaveRequestsDto {
  @ApiProperty({ required: false, default: 1, description: 'Trang TUẦN (1-based).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 4, description: 'Số tuần/trang (tối đa 12).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  weeksPerPage?: number = 4;

  @ApiProperty({ required: false, description: "PHA 2: 'YYYY-MM-DD' của Thứ 2 đầu tuần cần lấy bản ghi. Không truyền = chỉ trả `weeks` (đếm theo tuần)." })
  @IsOptional()
  @Matches(YMD, { message: 'weekStart phải theo định dạng YYYY-MM-DD' })
  weekStart?: string;

  @ApiProperty({ required: false, default: 1, description: 'Trang BÊN TRONG weekStart.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weekPage?: number;

  @ApiProperty({ required: false, default: 20, description: 'Số bản ghi/trang BÊN TRONG weekStart (tối đa 100).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  weekLimit?: number;

  @ApiProperty({ required: false, description: 'Tìm theo lý do (mine) hoặc tên/email người gửi + lý do (pending/history).' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiProperty({ required: false, description: 'Lọc theo phòng ban của người xin nghỉ (chỉ pending/history).' })
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

  @ApiProperty({ required: false, description: 'Lọc trạng thái. history: approved|rejected; mine: mọi trạng thái; pending bỏ qua.' })
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'cancelled'])
  status?: string;

  @ApiProperty({ required: false, description: "Đơn có khoảng nghỉ GIAO với [fromDate, toDate] (YYYY-MM-DD)." })
  @IsOptional()
  @Matches(YMD, { message: 'fromDate phải theo định dạng YYYY-MM-DD' })
  fromDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(YMD, { message: 'toDate phải theo định dạng YYYY-MM-DD' })
  toDate?: string;
}
