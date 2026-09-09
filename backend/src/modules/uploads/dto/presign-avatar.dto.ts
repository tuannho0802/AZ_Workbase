import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export class PresignAvatarDto {
  @ApiProperty({ enum: ALLOWED_IMAGE_TYPES })
  @IsIn(ALLOWED_IMAGE_TYPES)
  contentType: string;
}
