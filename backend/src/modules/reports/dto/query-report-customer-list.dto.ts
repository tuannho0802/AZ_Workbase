import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QueryReportDto } from './query-report.dto';

/** Chỉ số của báo cáo mà danh sách này "mở ra" - MỖI giá trị mirror ĐÚNG điều kiện của con số trên thẻ. */
export const REPORT_CUSTOMER_LIST_METRICS = [
  'total',
  'closed',
  'joined',
  'deposited',
  'cohort_deposited',
  'cohort_closed',
  'cohort_joined',
  'ftd',
  'redeposit',
  'unassigned_marketing',
  // ── Tab "Chất lượng nhóm": khách đứng sau các con số của nhóm liên kết (lọc thêm bằng groupId/categoryId) ──
  'group_members', // thành viên đã join (mọi thời điểm)
  'group_new_joins', // join nhóm TRONG KỲ
  'group_deposited', // thành viên đã từng nạp
  'group_no_deposit', // thành viên CHƯA nạp lần nào (cần chăm sóc)
  'group_closed', // thành viên đã chốt
  'group_new_deposited', // cohort: join trong kỳ VÀ đã từng nạp
  'group_new_closed', // cohort: join trong kỳ VÀ đã chốt
  'group_new_no_deposit', // cohort: join trong kỳ VÀ CHƯA nạp lần nào
  'new_no_group', // data mới trong kỳ chưa join nhóm nào
  // ── Tab "Chất lượng UTM": khách đứng sau các con số của UTM (lọc thêm bằng utmId/utmState/salesUserId/marketingUserId) ──
  'utm_customers', // khách đang gắn UTM (mọi thời điểm)
  'utm_new', // khách MỚI trong kỳ gắn UTM
  'utm_deposited', // khách của UTM đã từng nạp
  'utm_no_deposit', // khách của UTM CHƯA nạp lần nào (cần chăm sóc)
  'utm_closed', // khách của UTM đã chốt
  'utm_new_deposited', // cohort: khách mới trong kỳ VÀ đã từng nạp
  'utm_new_closed', // cohort: khách mới trong kỳ VÀ đã chốt
  'utm_new_no_deposit', // cohort: khách mới trong kỳ VÀ CHƯA nạp lần nào
  'new_no_utm', // data mới trong kỳ chưa gắn UTM
] as const;
export type ReportCustomerListMetric = (typeof REPORT_CUSTOMER_LIST_METRICS)[number];

export const REPORT_CUSTOMER_LIST_QUICK = ['no_marketing', 'no_sales', 'no_phone'] as const;
export type ReportCustomerListQuick = (typeof REPORT_CUSTOMER_LIST_QUICK)[number];

/**
 * Query danh sách khách drill-down = kỳ (kế thừa QueryReportDto) + chỉ số + bộ lọc + phân trang.
 * ValidationPipe bật `forbidNonWhitelisted` nên MỌI query param phải khai báo ở đây.
 * `marketingUserId=0` / `createdById=0` = "chưa gán" (IS NULL), cùng quy ước QueryMarketingReportDto.
 */
export class QueryReportCustomerListDto extends QueryReportDto {
  @ApiProperty({ enum: REPORT_CUSTOMER_LIST_METRICS })
  @IsIn(REPORT_CUSTOMER_LIST_METRICS as unknown as string[])
  metric: ReportCustomerListMetric;

  @ApiPropertyOptional({
    enum: ['customers', 'marketing', 'groups', 'utms'],
    description:
      'Tab đang xem - quyết định cách siết scope="own" cho khớp con số trên thẻ: customers = theo Sales chính; marketing = theo Marketing phụ trách/Người tạo; groups/utms = chỉ theo CustomerAccessHelper (đúng như báo cáo Chất lượng nhóm/UTM).',
  })
  @IsOptional()
  @IsIn(['customers', 'marketing', 'groups', 'utms'])
  context?: 'customers' | 'marketing' | 'groups' | 'utms';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 10, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: 'Tìm theo tên / SĐT / email' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Mã trạng thái khách (customer_statuses.code)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @ApiPropertyOptional({ description: 'Sales phụ trách chính (user id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  salesUserId?: number;

  @ApiPropertyOptional({ description: 'Marketing phụ trách (user id). 0 = chưa gán.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  marketingUserId?: number;

  @ApiPropertyOptional({ description: 'Người tạo data (user id). 0 = không rõ.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  createdById?: number;

  @ApiPropertyOptional({ description: 'Lọc thêm theo "Ngày nhập khách" (inputDate) - từ ngày, YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Lọc thêm theo "Ngày nhập khách" (inputDate) - đến ngày, YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ enum: REPORT_CUSTOMER_LIST_QUICK, description: 'Lọc nhanh' })
  @IsOptional()
  @IsIn(REPORT_CUSTOMER_LIST_QUICK as unknown as string[])
  quick?: ReportCustomerListQuick;

  @ApiPropertyOptional({ description: 'Chỉ dùng cho các metric group_* : lọc 1 nhóm liên kết (link_groups.id).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  groupId?: number;

  @ApiPropertyOptional({ description: 'Chỉ dùng cho các metric group_* : lọc theo Category/nền tảng (link_categories.id).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @ApiPropertyOptional({ description: 'Chỉ dùng cho các metric utm_* : lọc 1 UTM (utms.id).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  utmId?: number;

  @ApiPropertyOptional({
    enum: ['all', 'active', 'locked'],
    description: 'Chỉ dùng cho các metric utm_* : góc nhìn UTM Tất cả / Hoạt động / Đã khoá.',
  })
  @IsOptional()
  @IsIn(['all', 'active', 'locked'])
  utmState?: 'all' | 'active' | 'locked';
}
