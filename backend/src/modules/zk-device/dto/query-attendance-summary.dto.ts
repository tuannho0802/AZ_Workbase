import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsDateString, Min, Max } from 'class-validator';

export class QueryAttendanceSummaryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // [AGENT] NEW: chặn trần để 1 request không thể đòi trả về số dòng vô hạn
  // (AttendanceMonthlyTab dùng 3000 = ~30 ngày x 100 nhân viên, còn dư trần).
  @Max(5000)
  limit?: number = 31;

  // Bật PHÂN TRANG THEO TUẦN: khi truyền, `page` = trang tuần (mỗi trang gồm
  // ĐỦ dòng tổng hợp của N tuần Thứ 2-CN có dữ liệu, mới nhất trước) và
  // `limit` bị bỏ qua. Không truyền = phân trang theo dòng như cũ.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  weeksPerPage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
