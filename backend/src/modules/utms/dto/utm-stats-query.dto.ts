import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

const DATE_MSG = 'Ngày phải có dạng YYYY-MM-DD';

/** `?utmIds=1,2,3` hoặc `?utmIds=1&utmIds=2` -> [1,2,3]. Chuỗi rỗng -> [] (coi như không lọc). */
const toIdArray = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null) return undefined;
  const parts = (Array.isArray(value) ? value : String(value).split(',')).map((s) => String(s).trim()).filter((s) => s !== '');
  return parts.map(Number);
};

/**
 * Bộ lọc dùng CHUNG cho tab "Thống kê" (`GET /utms/stats`) và Mini Table khách (`GET /utms/stats/customers`) -
 * hai nơi luôn lọc cùng cách nên số ở chart khớp số dòng trong bảng.
 */
export class UtmStatsFilterDto {
  @ApiPropertyOptional({ example: '2026-09-01', description: 'Từ ngày nhập khách (YYYY-MM-DD, giờ VN). Mặc định: 30 ngày gần nhất.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MSG })
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Đến ngày nhập khách (YYYY-MM-DD, giờ VN). Mặc định: hôm nay.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MSG })
  to?: string;

  @ApiPropertyOptional({ example: 3, description: 'Chỉ thống kê 1 UTM (phải nằm trong phạm vi utms.view của người xem). Giữ để tương thích ngược.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  utmId?: number;

  @ApiPropertyOptional({
    example: '1,2,3',
    description: 'Chỉ các UTM này (danh sách ID, phân tách bằng dấu phẩy). UTM ngoài phạm vi utms.view bị bỏ qua. Bỏ trống = không lọc theo ID.',
  })
  @IsOptional()
  @Transform(toIdArray)
  @IsArray()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  @Min(1, { each: true })
  utmIds?: number[];

  @ApiPropertyOptional({ example: 5, description: 'Chỉ UTM có Quản lý CHÍNH là user này.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  primaryManagerId?: number;

  @ApiPropertyOptional({ example: 7, description: 'Chỉ UTM có user này là Quản lý PHỤ.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  secondaryManagerId?: number;
}

export class UtmStatsQueryDto extends UtmStatsFilterDto {}

/** Mini Table khách khi bấm vào chart/card của tab Thống kê. */
export class UtmStatsCustomersQueryDto extends UtmStatsFilterDto {
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

  @ApiPropertyOptional({ example: 'closed', description: 'Mã trạng thái khách' })
  @IsOptional()
  @IsString()
  status?: string;
}
