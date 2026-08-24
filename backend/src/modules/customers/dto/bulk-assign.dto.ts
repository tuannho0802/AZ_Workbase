import { IsArray, ArrayMinSize, ArrayMaxSize, IsInt, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class BulkAssignDto {
  @ApiProperty({ example: [1, 2, 3], description: 'Danh sách ID khách hàng cần gán (tối đa 500/lần)' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Phải chọn ít nhất 1 khách hàng' })
  @ArrayMaxSize(500, { message: 'Chỉ được chọn tối đa 500 khách hàng mỗi lần gán' })
  @IsInt({ each: true })
  @Type(() => Number)
  customerIds: number[];

  @ApiProperty({ example: [5, 7, 9], description: 'Danh sách ID của các Sales User nhận gán' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Phải chọn ít nhất 1 sales' })
  @ArrayMaxSize(50, { message: 'Chỉ được chọn tối đa 50 sales mỗi lần gán' })
  @IsInt({ each: true })
  @Type(() => Number)
  salesUserIds: number[];

  @ApiPropertyOptional({ example: 'Chia data từ batch tháng 4', description: 'Lý do gán (tuỳ chọn)' })
  @IsOptional()
  @IsString()
  reason?: string;
}