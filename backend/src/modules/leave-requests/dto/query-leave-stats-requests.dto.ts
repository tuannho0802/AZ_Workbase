import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { QueryLeaveStatsDto } from './query-leave-stats.dto';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Query "Mini Table đơn nghỉ" đứng sau Card/Chart của tab Thống kê: kế thừa kỳ + bộ lọc của
 * `GET /leave-requests/stats` (để số dòng KHỚP con số được bấm) + phân trang + lọc drill-down.
 * ValidationPipe global bật forbidNonWhitelisted nên MỌI param phải khai ở đây.
 */
export class QueryLeaveStatsRequestsDto extends QueryLeaveStatsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10, description: 'Tối đa 50.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiPropertyOptional({ enum: ['pending', 'approved', 'rejected'] })
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected';

  @ApiPropertyOptional({ enum: ['supplementary'], description: 'Lọc nhanh: đơn bổ sung (tạo bù).' })
  @IsOptional()
  @IsIn(['supplementary'])
  quick?: 'supplementary';

  @ApiPropertyOptional({ description: 'Nhiều nhân viên: "1,2,3" (tối đa 100 id).' })
  @IsOptional()
  @IsString()
  @MaxLength(700)
  @Matches(/^\d+(,\d+){0,99}$/, { message: 'requesterIds phải dạng "1,2,3"' })
  requesterIds?: string;

  @ApiPropertyOptional({ description: '1 = Thứ Hai ... 7 = Chủ Nhật (theo ngày bắt đầu nghỉ).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  weekday?: number;

  @ApiPropertyOptional({ description: "Bucket biểu đồ xu hướng: 'YYYY-MM-DD' hoặc 'YYYY-MM'." })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}(-\d{2})?$/, { message: 'bucket phải dạng YYYY-MM-DD hoặc YYYY-MM' })
  bucket?: string;

  @ApiPropertyOptional({ description: 'Khoảng nghỉ giao với [fromDate, toDate].' })
  @IsOptional()
  @Matches(YMD, { message: 'fromDate phải theo định dạng YYYY-MM-DD' })
  fromDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(YMD, { message: 'toDate phải theo định dạng YYYY-MM-DD' })
  toDate?: string;

  @ApiPropertyOptional({ description: 'Tìm theo tên nhân viên / phòng ban.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
