import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { QueryReportDto } from './dto/query-report.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

/**
 * Báo cáo doanh số - xem bảng phân quyền + quyết định thiết kế đầy đủ ở đầu
 * `reports.service.ts`. Mở cho cả 4 role (kể cả Employee) vì Employee vẫn
 * cần xem CHỈ SỐ CỦA CHÍNH MÌNH - phạm vi thật do service tự khoanh vùng
 * qua CustomerAccessHelper, không chặn ở tầng @Roles.
 */
@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('revenue')
  @Roles(Role.ADMIN, Role.ASSISTANT, Role.MANAGER, Role.EMPLOYEE)
  @ApiOperation({
    summary:
      'Báo cáo doanh thu (tiền) theo Cá nhân/Phòng ban/Tổng tất cả - phạm vi tự động theo role (xem PERMISSIONS.md)',
  })
  async getRevenueReport(@Query() query: QueryReportDto, @Request() req: any) {
    return this.reportsService.getRevenueReport(query, req.user.id, req.user.role);
  }

  @Get('customers')
  @Roles(Role.ADMIN, Role.ASSISTANT, Role.MANAGER, Role.EMPLOYEE)
  @ApiOperation({
    summary:
      'Báo cáo doanh số khách (tổng data / đã chốt / đã join nhóm) theo Cá nhân/Phòng ban/Tổng tất cả - phạm vi tự động theo role',
  })
  async getCustomerReport(@Query() query: QueryReportDto, @Request() req: any) {
    return this.reportsService.getCustomerReport(query, req.user.id, req.user.role);
  }
}
