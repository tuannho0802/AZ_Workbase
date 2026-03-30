import { IsArray, ArrayNotEmpty, IsInt, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkAssignDto {
  @ApiProperty({ example: [1, 2, 3], description: 'Danh sách ID khách hàng cần gán' })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  customerIds: number[];

  @ApiProperty({ example: 7, description: 'ID của Sales User nhận gán' })
  @IsNotEmpty()
  @IsInt()
  salesUserId: number;
}
