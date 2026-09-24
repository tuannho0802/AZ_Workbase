import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, IsString, Min, Max, IsEnum, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { PeriodType } from '../../../common/enums/period-type.enum';

/**
 * PeriodicTaskFiltersDto - `GET /periodic-tasks` hỗ trợ ĐỒNG THỜI 2 kiểu lọc
 * thời gian, kết hợp được với nhau (AND) - xem PLAN mục 2.11:
 *  - Khớp CHÍNH XÁC 1 kỳ: `periodType` + `periodStartDate`.
 *  - Khớp theo KHOẢNG (range, overlap): `dateFrom`/`dateTo` (không cần
 *    `periodType`, dùng riêng hoặc kết hợp cùng `periodType`).
 */
export class PeriodicTaskFiltersDto {
  @ApiPropertyOptional({ example: 1, description: 'Trang hiện tại' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, description: 'Số lượng trả về mỗi trang (tối đa 100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: PeriodType, example: PeriodType.DAILY })
  @IsOptional()
  @IsEnum(PeriodType, { message: 'periodType phải là 1 trong: daily, weekly, monthly, yearly' })
  periodType?: PeriodType;

  @ApiPropertyOptional({ example: '2026-09-14', description: 'Khớp CHÍNH XÁC periodStartDate của Task (dùng cùng periodType)' })
  @IsOptional()
  @IsDateString({}, { message: 'periodStartDate phải đúng định dạng ngày YYYY-MM-DD' })
  periodStartDate?: string;

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Lọc theo khoảng - biên dưới (chồng lấn với period_start_date/period_end_date). Không truyền dateFrom/dateTo => MẶC ĐỊNH TUẦN NÀY; tối đa 93 ngày' })
  @IsOptional()
  @IsDateString({}, { message: 'dateFrom phải đúng định dạng ngày YYYY-MM-DD' })
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Lọc theo khoảng - biên trên' })
  @IsOptional()
  @IsDateString({}, { message: 'dateTo phải đúng định dạng ngày YYYY-MM-DD' })
  dateTo?: string;

  @ApiPropertyOptional({ example: 2, description: 'Lọc theo trạng thái (periodic_task_statuses.id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  statusId?: number;

  @ApiPropertyOptional({ example: 5, description: 'Lọc theo người phụ trách chính' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  primaryAssigneeId?: number;

  @ApiPropertyOptional({
    example: 5,
    description: 'Lọc theo NGƯỜI PHỤ TRÁCH = là Phụ trách CHÍNH **hoặc** Phụ trách PHỤ của Task',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assigneeId?: number;

  @ApiPropertyOptional({ example: 1, description: 'Lọc theo phòng ban' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ example: 'gọi lại', description: 'Tìm theo tiêu đề (LIKE)' })
  @IsOptional()
  @IsString()
  search?: string;
}
