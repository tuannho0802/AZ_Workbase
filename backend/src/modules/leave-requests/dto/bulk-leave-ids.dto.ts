import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Trần số đơn/1 lần thao tác hàng loạt (xoá mềm / xoá vĩnh viễn). */
export const BULK_LEAVE_MAX = 100;

/**
 * Body chung cho `POST /leave-requests/bulk-trash` và
 * `POST /leave-requests/trash/bulk-delete`. ValidationPipe global bật
 * forbidNonWhitelisted nên FE KHÔNG được gửi field lạ.
 */
export class BulkLeaveIdsDto {
  @ApiProperty({ type: [Number], description: `Danh sách id đơn (1..${BULK_LEAVE_MAX}, không trùng).` })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_LEAVE_MAX)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
