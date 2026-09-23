import { IsOptional, IsInt, IsString, Min, Max, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CustomerFiltersDto {
  @ApiPropertyOptional({ example: 1, description: 'Trang hiện tại' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, description: 'Số lượng trả về mỗi trang (tối đa 100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
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

  @ApiPropertyOptional({ example: 4, description: 'Lọc theo Marketing phụ trách (người nhập data)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  marketingUserId?: number;

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

  // ⚠️ MỚI (yêu cầu người dùng - trang /chia-data): tách riêng khoảng ngày
  // lọc theo `createdAt` ("Ngày nhập thực tế" - timestamp THẬT lúc tạo bản
  // ghi, có giờ:phút) khỏi `dateFrom`/`dateTo` ở trên (đang lọc `inputDate`
  // - ngày người nhập tự chọn/không giờ phút). 2 khoảng ngày độc lập, không
  // đè lên nhau.
  @ApiPropertyOptional({ example: '2026-01-01', description: 'Lọc theo Ngày nhập THỰC TẾ (createdAt) từ ngày - KHÁC dateFrom (lọc inputDate)' })
  @IsOptional()
  @IsString()
  createdAtFrom?: string;

  @ApiPropertyOptional({ example: '2026-01-31', description: 'Lọc theo Ngày nhập THỰC TẾ (createdAt) đến ngày - KHÁC dateTo (lọc inputDate)' })
  @IsOptional()
  @IsString()
  createdAtTo?: string;

  @ApiPropertyOptional({ example: 3, description: 'Lọc theo người tạo (Data Owner) - dùng cho tab Chia Data' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  creatorId?: number;

  @ApiPropertyOptional({
    example: 'joined',
    enum: ['joined', 'not_joined'],
    description: 'Lọc theo trạng thái "đã join ít nhất 1 nhóm liên kết" (Zalo/FB/Threads...). joined = đã join >=1 nhóm, not_joined = chưa join nhóm nào.',
  })
  @IsOptional()
  @IsEnum(['joined', 'not_joined'])
  joinedGroups?: 'joined' | 'not_joined';

  @ApiPropertyOptional({ example: 5, description: 'Lọc theo người đã xóa mềm (Người xóa) - chỉ dùng ở GET /customers/trash' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  deletedById?: number;
}