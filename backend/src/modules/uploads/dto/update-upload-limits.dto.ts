import { IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUploadLimitsDto {
  @ApiProperty({ example: 1024, description: 'KB, tối đa 1 ảnh đại diện' })
  @IsInt()
  @Min(64)
  @Max(10240)
  avatarMaxSizeKb: number;

  @ApiProperty({ example: 1536, description: 'KB, tối đa MỖI ảnh đính kèm nghỉ phép' })
  @IsInt()
  @Min(64)
  @Max(10240)
  leaveAttachmentMaxSizeKb: number;

  @ApiProperty({ example: 5, description: 'Số ảnh đính kèm tối đa / 1 đơn nghỉ phép' })
  @IsInt()
  @Min(1)
  @Max(20)
  leaveAttachmentMaxCount: number;
}
