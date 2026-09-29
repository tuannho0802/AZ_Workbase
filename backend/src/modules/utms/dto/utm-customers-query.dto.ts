import { IsOptional, IsString, IsInt, IsIn, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UtmCustomersQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, description: 'Tối đa 50 dòng/trang' })
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

  @ApiPropertyOptional({
    enum: ['exclude', 'include', 'only'],
    default: 'exclude',
    description:
      'Khách trong Thùng rác: exclude = ẩn (mặc định), include = hiện lẫn, only = chỉ Thùng rác. include/only đòi quyền customers.trash_manage.',
  })
  @IsOptional()
  @IsIn(['exclude', 'include', 'only'])
  trashed?: 'exclude' | 'include' | 'only';
}
