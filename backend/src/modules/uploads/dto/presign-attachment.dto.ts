import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ALLOWED_IMAGE_TYPES } from './presign-avatar.dto';

export class PresignAttachmentDto {
  @ApiProperty({ enum: ALLOWED_IMAGE_TYPES })
  @IsIn(ALLOWED_IMAGE_TYPES)
  contentType: string;
}
