import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DiscardAttachmentsDto {
  @ApiProperty({
    type: [String],
    description:
      'Danh sách object key đã PUT lên B2 qua /leave-requests/attachments/presign nhưng CHƯA gắn vào đơn nào ' +
      '(người dùng xoá khỏi picker hoặc huỷ Modal trước khi bấm "Tạo đơn"). Tối đa 20 key/lần.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  keys: string[];
}
