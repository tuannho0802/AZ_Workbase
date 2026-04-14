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

  @ApiPropertyOptional({ example: 'createdAt', enum: ['createdAt', 'name', 'status', 'closedDate', 'totalDeposit30Days', 'phone', 'inputDate'] })
  @IsOptional()
  @IsEnum(['createdAt', 'name', 'status', 'closedDate', 'totalDeposit30Days', 'phone', 'inputDate'])
  sortField?: string = 'createdAt';

  @ApiPropertyOptional({ example: 'DESC', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  @ApiPropertyOptional({ example: 'closed' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'Facebook' })
  @IsOptional()
  @IsString()
  source?: string;


  @ApiPropertyOptional({ example: 'Nguyen' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-01-31' })
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional({ example: 3, description: 'Lọc theo người tạo (Data Owner) - dùng cho tab Chia Data' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  creatorId?: number;
}
