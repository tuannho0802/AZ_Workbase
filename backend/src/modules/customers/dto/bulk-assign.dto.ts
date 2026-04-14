import { IsArray, ArrayNotEmpty, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BulkAssignDto {
  @ApiProperty({ example: [1, 2, 3], description: 'Danh sách ID khách hàng cần gán' })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  customerIds: number[];

  @ApiProperty({ example: [5, 7, 9], description: 'Danh sách ID của các Sales User nhận gán' })
  @IsNotEmpty()
  @IsArray()
  @IsInt({ each: true })
  salesUserIds: number[];

  @ApiPropertyOptional({ example: 'Chia data từ batch tháng 4', description: 'Lý do gán (tuỳ chọn)' })
  @IsOptional()
  @IsString()
  reason?: string;
}
