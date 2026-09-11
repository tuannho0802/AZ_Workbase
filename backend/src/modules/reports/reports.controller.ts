import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { QueryReportDto } from './dto/query-report.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GetPermissionScope } from '../../common/decorators/get-permission-scope.decorator';

/**
 * Báo cáo doanh số - xem bảng phân quyền + quyết định thiết kế đầy đủ ở đầu
 * `reports.service.ts`. Mở cho cả 4 role (kể cả Employee) vì Employee vẫn
 * cần xem CHỈ SỐ CỦA CHÍNH MÌNH - phạm vi thật do service tự khoanh vùng
 * thuần theo `scope` (own/department/all) đọc từ `role_permissions` qua
 * `@GetPermissionScope()`, KHÔNG còn hardcode theo Role trong service (trừ
 * `Role.ADMIN` - ngoại lệ duy nhất, xem reports.service.ts).
 */
@ApiTags('Reports')
@ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('revenue')
  @RequirePermission('reports.view')
  @ApiOperation({
    summary:
      'Báo cáo doanh thu (tiền) theo Cá nhân/Phòng ban/Tổng tất cả - phạm vi tự động theo role (xem PERMISSIONS.md)',
  })
  async getRevenueReport(
    @Query() query: QueryReportDto,
    @Request() req: any,
    @GetPermissionScope() scope: string | null,
  ) {
    return this.reportsService.getRevenueReport(query, req.user.id, req.user.role, scope);
  }

  @Get('customers')
  @RequirePermission('reports.view')
  @ApiOperation({
    summary:
      'Báo cáo doanh số khách (tổng data / đã chốt / đã join nhóm) theo Cá nhân/Phòng ban/Tổng tất cả - phạm vi tự động theo role',
  })
  async getCustomerReport(
    @Query() query: QueryReportDto,
    @Request() req: any,
    @GetPermissionScope() scope: string | null,
  ) {
    return this.reportsService.getCustomerReport(query, req.user.id, req.user.role, scope);
  }
}