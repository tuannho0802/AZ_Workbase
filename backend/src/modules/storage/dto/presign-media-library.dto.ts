import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ALLOWED_IMAGE_TYPES } from '../../uploads/dto/presign-avatar.dto';

export class PresignMediaLibraryDto {
  @ApiProperty({ enum: ALLOWED_IMAGE_TYPES })
  @IsIn(ALLOWED_IMAGE_TYPES)
  contentType: string;
}
