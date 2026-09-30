import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class BulkRemoveUtmDto {
  @ApiProperty({ example: 12, description: 'UTM đang gỡ - chỉ gỡ khách còn thuộc ĐÚNG UTM này (chống danh sách cũ trên UI)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  utmId: number;

  @ApiProperty({ example: [1, 2, 3], description: 'ID khách hàng cần gỡ UTM (tối đa 100/lần)' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Phải chọn ít nhất 1 khách hàng' })
  @ArrayMaxSize(100, { message: 'Chỉ được chọn tối đa 100 khách hàng mỗi lần' })
  @ArrayUnique()
  @IsInt({ each: true })
  @Type(() => Number)
  customerIds: number[];
}
