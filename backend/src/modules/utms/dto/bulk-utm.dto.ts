import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export const BULK_UTM_MAX = 100;

export class BulkUtmIdsDto {
  @ApiProperty({ example: [1, 2, 3], description: `ID các UTM (tối đa ${BULK_UTM_MAX}/lần)` })
  @IsArray()
  @ArrayMinSize(1, { message: 'Phải chọn ít nhất 1 UTM' })
  @ArrayMaxSize(BULK_UTM_MAX, { message: `Chỉ được chọn tối đa ${BULK_UTM_MAX} UTM mỗi lần` })
  @ArrayUnique()
  @IsInt({ each: true })
  @Type(() => Number)
  ids: number[];
}

export class BulkUtmStatusDto extends BulkUtmIdsDto {
  @ApiProperty({ example: false, description: 'true = mở khoá, false = khoá' })
  @IsBoolean()
  active: boolean;
}
