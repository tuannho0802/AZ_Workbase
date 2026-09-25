import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, IsDateString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { PeriodType } from '../../../common/enums/period-type.enum';

/**
 * Filter cho `GET /periodic-tasks-performance/*` - mirror ĐÚNG quy ước
 * `dateFrom`/`dateTo` của `PeriodicTaskFiltersDto` (lọc theo GIAO khoảng với
 * `period_start_date`/`period_end_date`, không truyền gì => mặc định TUẦN
 * NÀY - xem `helpers/list-window.helper.ts::resolveListWindow()`), KHÔNG bịa
 * quy ước ngày mới riêng cho trang Hiệu suất.
 */
export class PeriodicTaskPerformanceFiltersDto {
  @ApiPropertyOptional({ example: '2026-09-01', description: 'Lọc theo khoảng - biên dưới. Không truyền dateFrom/dateTo => mặc định TUẦN NÀY (giờ VN); tối đa 93 ngày' })
  @IsOptional()
  @IsDateString({}, { message: 'dateFrom phải đúng định dạng ngày YYYY-MM-DD' })
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Lọc theo khoảng - biên trên' })
  @IsOptional()
  @IsDateString({}, { message: 'dateTo phải đúng định dạng ngày YYYY-MM-DD' })
  dateTo?: string;

  @ApiPropertyOptional({ enum: PeriodType, description: 'Chỉ tính Task thuộc đúng 1 loại kỳ hạn (bỏ trống = tính cả 4 loại)' })
  @IsOptional()
  @IsEnum(PeriodType, { message: 'periodType phải là 1 trong: daily, weekly, monthly, yearly' })
  periodType?: PeriodType;

  @ApiPropertyOptional({ example: 3, description: 'Chỉ áp dụng khi scope resolve được là department/all - lọc thêm theo 1 phòng ban cụ thể' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ example: 12, description: 'Xem chi tiết đúng 1 User (phải nằm trong phạm vi scope của người xem, trừ khi xem chính mình)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @ApiPropertyOptional({
    example: 1,
    description:
      'CHỈ dùng cho `GET /users/:userId/tasks` - trang hiện tại của nhóm "Phụ trách chính" (phân trang SERVER-SIDE, ' +
      'kích thước trang cố định ở BE - xem `USER_TASKS_PAGE_SIZE`). Mặc định 1.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  primaryPage?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'CHỈ dùng cho `GET /users/:userId/tasks` - trang hiện tại của nhóm "Phụ trách phụ" (tương tự `primaryPage`). Mặc định 1.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  secondaryPage?: number;
}