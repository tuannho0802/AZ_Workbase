import { IsArray, ArrayMinSize, IsInt, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class BulkAssignDto {
  @ApiProperty({ example: [1, 2, 3], description: 'Danh sách ID khách hàng cần gán' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Phải chọn ít nhất 1 khách hàng' })
  @IsInt({ each: true })
  @Type(() => Number)
  customerIds: number[];

  @ApiProperty({ example: [5, 7, 9], description: 'Danh sách ID của các Sales User nhận gán' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Phải chọn ít nhất 1 sales' })
  @IsInt({ each: true })
  @Type(() => Number)
  salesUserIds: number[];

  @ApiPropertyOptional({ example: 'Chia data từ batch tháng 4', description: 'Lý do gán (tuỳ chọn)' })
  @IsOptional()
  @IsString()
  reason?: string;
}
