import { IsOptional, IsInt, Min, Max, IsString, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Query của `GET /link-groups/:id/customers` (mini table "Xem khách hàng (N)"). */
export class GroupCustomersQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, description: 'Tối đa 50 dòng/trang (mini table)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiPropertyOptional({ example: 'Nguyễn', description: 'Tìm theo tên hoặc SĐT' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'closed' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'Facebook' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  salesUserId?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  marketingUserId?: number;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Lọc "Ngày nhập" (inputDate) từ ngày' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-01-31' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
