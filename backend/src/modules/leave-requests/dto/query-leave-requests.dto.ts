import { IsOptional, IsNumber, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO chung cho 4 endpoint danh sách đơn nghỉ phép (`GET /leave-requests`,
 * `/pending`, `/history`, `/trash`) - mirror ĐÚNG `GetAuditLogsDto` (xem
 * `audit/dto/get-audit-logs.dto.ts`): hỗ trợ CẢ HAI chế độ phân trang:
 *
 * 1. Phân trang THEO BẢN GHI (mặc định, không truyền `weeksPerPage`):
 *    `page`/`limit` như thông thường.
 * 2. Phân trang THEO TUẦN ("week-mode", truyền `weeksPerPage`): `page` giờ
 *    là trang TUẦN, `limit` bị bỏ qua - xem `week-window.util.ts`. Dùng cho
 *    trang "4 tuần" (`weeksPerPage=4`) ở `duyet-phep`/`nghi-phep`, thay thế
 *    hoàn toàn cách cũ (tải HẾT rồi gộp tuần ở RAM qua `WeekGroupedRequests`)
 *    - đây là nguyên nhân lag khi dữ liệu nhiều lên.
 *
 * Không phải field nào cũng áp dụng cho MỌI endpoint (vd `departmentId` chỉ
 * có ý nghĩa ở `pending`/`history`/`trash`, không phải `findAll` của riêng
 * mình) - Service tự bỏ qua field không liên quan, dùng 1 DTO chung để đỡ
 * lặp lại 4 lần cùng 1 bộ field phân trang.
 */
export class QueryLeaveRequestsDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20, description: 'Tối đa 100/trang' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({
    required: false,
    description:
      'Bật PHÂN TRANG THEO TUẦN: khi truyền, `page` = trang tuần (mỗi trang gồm ĐỦ bản ghi của N tuần ' +
      'Thứ 2-CN có dữ liệu, mới nhất trước) và `limit` bị bỏ qua. Không truyền = phân trang theo bản ghi như cũ.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(12)
  weeksPerPage?: number;

  @ApiProperty({
    required: false,
    description:
      'CHỈ dùng kèm `weeksPerPage`: FE truyền khi thực sự MỞ 1 panel tuần cụ thể (lazy-load), dạng ' +
      '"YYYY-MM-DD" của Thứ 2 đầu tuần. Không truyền = chỉ trả `weeks` (đếm theo tuần), KHÔNG fetch bản ghi nào.',
  })
  @IsOptional()
  @IsString()
  weekStart?: string;

  @ApiProperty({ required: false, default: 1, description: 'Trang BÊN TRONG `weekStart`.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  weekPage?: number;

  @ApiProperty({ required: false, default: 20, description: 'Số bản ghi/trang BÊN TRONG `weekStart`.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  weekLimit?: number;

  @ApiProperty({ required: false, description: 'Tìm theo tên/email người gửi + lý do' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, description: 'Lọc theo phòng ban của người gửi' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  departmentId?: number;

  @ApiProperty({ required: false, description: 'Lọc theo mã loại phép (leave_types.code)' })
  @IsOptional()
  @IsString()
  leaveType?: string;

  @ApiProperty({ required: false, description: 'Lọc theo trạng thái đơn' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ required: false, description: 'Từ ngày (YYYY-MM-DD) - lọc theo khoảng nghỉ giao nhau' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiProperty({ required: false, description: 'Đến ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
