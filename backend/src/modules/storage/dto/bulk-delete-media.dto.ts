import { ArrayMaxSize, ArrayMinSize, ArrayNotEmpty, IsArray, IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { STORAGE_BUCKET_KEYS } from '../storage.constants';
import type { StorageBucketKey } from '../storage.constants';

// Giới hạn 200 key/lần gọi - đủ cho 1 lần "chọn tất cả trang hiện tại" (FE
// phân trang tối đa 1000/trang, nhưng UI chọn bulk chỉ nên thao tác theo
// từng đợt nhỏ để không timeout hàm serverless (Vercel) khi phải gọi tuần
// tự N lần DeleteObjectCommand + N lần UPDATE/DELETE DB.
const MAX_BULK_DELETE_KEYS = 200;

export class BulkDeleteMediaDto {
  @ApiProperty({ enum: STORAGE_BUCKET_KEYS })
  @IsIn(STORAGE_BUCKET_KEYS)
  bucket: StorageBucketKey;

  @ApiProperty({
    type: [String],
    example: ['avatars/12/NguyenVanA_PhongKinhDoanh_Employee.webp', 'avatars/15/TranThiB_PhongMarketing_Manager.png'],
    maxItems: MAX_BULK_DELETE_KEYS,
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'Phải chọn ít nhất 1 file để xoá' })
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_DELETE_KEYS, { message: `Chỉ xoá tối đa ${MAX_BULK_DELETE_KEYS} file/lần` })
  @IsString({ each: true })
  keys: string[];
}
