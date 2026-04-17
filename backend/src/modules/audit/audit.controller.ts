import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { GetAuditLogsDto } from './dto/get-audit-logs.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Lấy danh sách nhật ký hành động (Chỉ Admin & Manager)' })
  async getLogs(@Query() filters: GetAuditLogsDto) {
    return this.auditService.getLogs(filters);
  }

  @Get('actions')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Lấy danh sách action types đã xuất hiện (cho filter dropdown)' })
  async getActions() {
    return this.auditService.getDistinctActions();
  }
}
