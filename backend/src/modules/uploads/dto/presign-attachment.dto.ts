import { IsIn, IsString, Matches, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ALLOWED_IMAGE_TYPES } from './presign-avatar.dto';

export class PresignAttachmentDto {
  @ApiProperty({ enum: ALLOWED_IMAGE_TYPES })
  @IsIn(ALLOWED_IMAGE_TYPES)
  contentType: string;

  // Đơn NGHỈ PHÉP nào - lấy từ Form (field `leaveType`) tại thời điểm đính
  // kèm, TRƯỚC khi đơn thật được tạo (xem LeaveRequestsController.presignAttachment
  // - presign luôn đi trước POST /leave-requests). Dùng để đặt tên file dễ
  // đọc "{TenNV}_{Role}_{LoaiNghiPhep}_{N}_{Ngay}.{ext}" (xem uploads.service.ts).
  // ⚠️ KHÔNG còn `@IsEnum(LeaveType)` kể từ `CreateLeaveTypes1781500000000` -
  // `leave_types.code` giờ tự do (Admin/Assistant tự CRUD qua module
  // `leave-types`), validate ở đây chỉ còn là format `code` hợp lệ (khớp
  // đúng regex `CreateLeaveTypeDto.code`), KHÔNG check tồn tại trong DB (bước
  // này chỉ phục vụ ĐẶT TÊN FILE, không phải nghiệp vụ - tên file vẫn ra
  // đúng dù gõ nhầm code, không ảnh hưởng tính đúng đắn của đơn).
  @ApiProperty({ example: 'annual', description: 'Mã loại nghỉ phép (leave_types.code) - dùng để đặt tên file dễ đọc' })
  @IsString()
  @Matches(/^[a-z0-9_]+$/, { message: 'leaveType không hợp lệ' })
  leaveType: string;

  // Số thứ tự ảnh trong CÙNG 1 đơn (bắt đầu từ 1) - FE tự tính bằng
  // `value.length + 1` mỗi lần thêm ảnh (xem AttachmentUploader.tsx).
  @ApiProperty({ example: 1, minimum: 1, description: 'Số thứ tự ảnh trong đơn, bắt đầu từ 1' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  index: number;
}