import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class MergeUtmDto {
  @ApiProperty({ example: 12, description: 'ID UTM ĐÍCH (giữ lại). UTM nguồn (:id) sẽ bị xoá sau khi chuyển hết khách hàng.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  targetId: number;
}
