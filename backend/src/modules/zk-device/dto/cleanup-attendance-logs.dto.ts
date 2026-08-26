import { IsDateString } from 'class-validator';

/**
 * BẮT BUỘC phải truyền `olderThan` tường minh (không có giá trị mặc định) -
 * cố tình KHÔNG cho phép gọi API này mà không chỉ rõ mốc ngày, để tránh 1 lần
 * gọi nhầm (quên query param) xoá sạch toàn bộ bảng `attendance_logs`.
 */
export class CleanupAttendanceLogsDto {
  @IsDateString()
  olderThan: string; // 'YYYY-MM-DD' - xoá mọi log có record_time < olderThan 00:00:00
}