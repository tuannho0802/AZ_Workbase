import { Controller, Get, Post, Delete, Query, Body, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { GetAuditLogsDto } from './dto/get-audit-logs.dto';
import { UpdateAuditSettingsDto, CleanupAuditLogsDto, BulkDeleteAuditLogsDto } from './dto/audit-cleanup.dto';
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
  @ApiOperation({ summary: 'Lấy danh sách nhật ký hành động' })
  async getLogs(@Query() filters: GetAuditLogsDto) {
    return this.auditService.getLogs(filters);
  }

  @Get('actions')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Lấy danh sách bộ lọc hành động' })
  async getActions() {
    return this.auditService.getDistinctActions();
  }

  // --- CLEANUP & SETTINGS (ADMIN ONLY) ---

  @Get('settings')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Lấy cấu hình dọn dẹp nhật ký' })
  async getSettings() {
    return this.auditService.getCleanupSettings();
  }

  @Post('settings')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cập nhật cấu hình dọn dẹp' })
  async updateSettings(@Body() dto: UpdateAuditSettingsDto, @Req() req: any) {
    return this.auditService.updateCleanupSettings(dto.enabled, dto.retentionDays, req.user.id);
  }

  @Delete('cleanup')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Xóa nhật ký theo khoảng ngày' })
  async cleanup(@Query() dto: CleanupAuditLogsDto, @Req() req: any) {
    return this.auditService.cleanupByDateRange(dto.from, dto.to, req.user.id);
  }

  @Delete('bulk')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Xóa nhật ký hàng loạt theo ID' })
  async bulkDelete(@Body() dto: BulkDeleteAuditLogsDto, @Req() req: any) {
    return this.auditService.bulkDelete(dto.ids, req.user.id);
  }
}
