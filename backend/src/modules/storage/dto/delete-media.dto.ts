import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { STORAGE_BUCKET_KEYS } from '../storage.constants';
import type { StorageBucketKey } from '../storage.constants';

export class DeleteMediaDto {
  @ApiProperty({ enum: STORAGE_BUCKET_KEYS })
  @IsIn(STORAGE_BUCKET_KEYS)
  bucket: StorageBucketKey;

  @ApiProperty({ example: 'media-library/abc123.webp' })
  @IsString()
  @IsNotEmpty()
  key: string;
}
