import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsArray, ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * GetPeriodicTaskLinksBatchDto - query của `GET /periodic-tasks/links`
 * (Phase 8, PLAN mục Phase 8 "Cải tiến view switcher" - phần "hiển thị UI
 * nối/xếp hàng các Task đã liên kết"). Nhận `taskIds` dạng chuỗi phân tách
 * dấu phẩy trên URL (`?taskIds=1,2,3`) - KHÔNG dùng `taskIds[]` lặp lại
 * nhiều query param (đơn giản hơn cho FE tự build từ mảng `tasks` đang có,
 * mirror cách nhiều API list khác trong dự án nhận filter dạng chuỗi).
 *
 * Giới hạn tối đa 200 phần tử - khớp đúng `limit` tối đa 1 lần gọi
 * `GET /periodic-tasks` (100) + biên độ dư cho trường hợp gộp cả `filters`
 * (Table) lẫn `nonTableFilters` (Agenda/Kanban/Calendar) trong 1 lần tải
 * trang - không có kịch bản hợp lệ nào cần hơn 200 Task 1 lúc.
 */
export class GetPeriodicTaskLinksBatchDto {
  @ApiPropertyOptional({
    example: '1,2,3',
    description: 'Danh sách ID Task cần tra liên kết, phân tách bằng dấu phẩy',
  })
  @Transform(({ value }) => {
    if (typeof value !== 'string' || value.trim() === '') return [];
    return value
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isInteger(n));
  })
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(200, { message: 'taskIds tối đa 200 phần tử/lần gọi' })
  @IsInt({ each: true })
  taskIds: number[] = [];
}
