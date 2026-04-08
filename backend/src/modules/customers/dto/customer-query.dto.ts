import { IsOptional, IsInt, Min, Max, IsString, IsIn, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CustomerQueryDto {
  @ApiPropertyOptional({ example: 1, description: 'Trang hiện tại' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 50, description: 'Số bản ghi trên mỗi trang' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ example: 'createdAt', description: 'Trường sắp xếp (createdAt, name, phone, status, totalDeposit30Days)' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ example: 'DESC', enum: ['ASC', 'DESC'], description: 'Thứ tự sắp xếp' })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  @ApiPropertyOptional({ example: 'Nguyễn', description: 'Tìm kiếm theo tên, SĐT hoặc UTM' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'Facebook', description: 'Lọc theo nguồn' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ example: 'pending', description: 'Lọc theo trạng thái' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 1, description: 'Lọc theo nhân viên Sales' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  salesUserId?: number;

  @ApiPropertyOptional({ example: '2024-01-01', description: 'Lọc từ ngày' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2024-12-31', description: 'Lọc đến ngày' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
