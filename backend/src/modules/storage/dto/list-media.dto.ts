import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { STORAGE_BUCKET_KEYS } from '../storage.constants';
import type { StorageBucketKey } from '../storage.constants';

export class ListMediaDto {
  @ApiPropertyOptional({ enum: STORAGE_BUCKET_KEYS })
  @IsIn(STORAGE_BUCKET_KEYS)
  bucket: StorageBucketKey;

  @ApiPropertyOptional({ description: 'ContinuationToken của B2 (S3-compatible) để lấy trang tiếp theo' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
