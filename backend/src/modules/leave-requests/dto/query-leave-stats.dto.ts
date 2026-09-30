import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { QueryReportDto } from '../../reports/dto/query-report.dto';

/**
 * Query thống kê nghỉ phép = kỳ báo cáo (kế thừa QueryReportDto, cùng quy ước
 * tuần/tháng/quý/năm/tuỳ chọn TRỌN VẸN như trang Báo cáo) + bộ lọc tuỳ chọn.
 * ValidationPipe global bật `forbidNonWhitelisted` nên MỌI param phải khai ở đây.
 */
export class QueryLeaveStatsDto extends QueryReportDto {
  @ApiPropertyOptional({ description: 'Chỉ tính nhân viên thuộc 1 phòng ban.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  departmentId?: number;

  @ApiPropertyOptional({ description: 'Chỉ tính 1 loại phép (leave_types.code).' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'leaveType không hợp lệ' })
  leaveType?: string;

  @ApiPropertyOptional({ description: 'Chỉ xem 1 nhân viên (user id).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  requesterId?: number;
}
