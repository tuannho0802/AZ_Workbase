import { IsIn, IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ALLOWED_IMAGE_TYPES } from './presign-avatar.dto';
import { LeaveType } from '../../../database/entities/leave-request.entity';

export class PresignAttachmentDto {
  @ApiProperty({ enum: ALLOWED_IMAGE_TYPES })
  @IsIn(ALLOWED_IMAGE_TYPES)
  contentType: string;

  // Đơn NGHỈ PHÉP nào - lấy từ Form (field `leaveType`) tại thời điểm đính
  // kèm, TRƯỚC khi đơn thật được tạo (xem LeaveRequestsController.presignAttachment
  // - presign luôn đi trước POST /leave-requests). Dùng để đặt tên file dễ
  // đọc "{TenNV}_{Role}_{LoaiNghiPhep}_{N}_{Ngay}.{ext}" (xem uploads.service.ts).
  @ApiProperty({ enum: LeaveType, description: 'Loại nghỉ phép - dùng để đặt tên file dễ đọc' })
  @IsEnum(LeaveType)
  leaveType: LeaveType;

  // Số thứ tự ảnh trong CÙNG 1 đơn (bắt đầu từ 1) - FE tự tính bằng
  // `value.length + 1` mỗi lần thêm ảnh (xem AttachmentUploader.tsx).
  @ApiProperty({ example: 1, minimum: 1, description: 'Số thứ tự ảnh trong đơn, bắt đầu từ 1' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  index: number;
}