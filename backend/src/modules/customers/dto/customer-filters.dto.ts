import { IsOptional, IsInt, IsString, Min, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CustomerFiltersDto {
  @ApiPropertyOptional({ example: 1, description: 'Trang hiện tại' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, description: 'Số lượng trả về mỗi trang' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ example: 1, description: 'Lọc theo phòng ban' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ example: 2, description: 'Lọc theo Sales phụ trách' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  salesUserId?: number;

  @ApiPropertyOptional({ example: 'pending', enum: ['closed', 'pending', 'potential', 'lost', 'inactive'], description: 'Lọc theo trạng thái' })
  @IsOptional()
  @IsEnum(['closed', 'pending', 'potential', 'lost', 'inactive'])
  status?: string;

  @ApiPropertyOptional({ example: 'Nguyen', description: 'Tìm kiếm theo tên, SĐT, hoặc Email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: '2024-01-01', description: 'Lọc từ ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2024-12-31', description: 'Lọc tới ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
