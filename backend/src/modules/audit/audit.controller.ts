import { Controller, Get, Post, Delete, Query, Body, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { GetAuditLogsDto } from './dto/get-audit-logs.dto';
import { UpdateAuditSettingsDto, CleanupAuditLogsDto, BulkDeleteAuditLogsDto } from './dto/audit-cleanup.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('Audit Logs')
@ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermission('audit.manage')
  @ApiOperation({ summary: 'Lấy danh sách nhật ký hành động' })
  async getLogs(@Query() filters: GetAuditLogsDto) {
    return this.auditService.getLogs(filters);
  }

  @Get('actions')
  @RequirePermission('audit.manage')
  @ApiOperation({ summary: 'Lấy danh sách bộ lọc hành động' })
  async getActions() {
    return this.auditService.getDistinctActions();
  }

  // --- CLEANUP & SETTINGS — PERMISSIONS.md mục 2.7: đồng nhất permission
  // `audit.manage` cho toàn bộ 6 endpoint của module này (kể cả cleanup/xoá)
  // - ngoại lệ có chủ đích so với rule Xoá=chỉ-Admin chung, vì đây là thao
  // tác dọn dẹp vận hành hệ thống, không phải xoá dữ liệu nghiệp vụ. Role
  // không có `audit.manage` (Manager/Employee mặc định, trừ khi Admin tự cấp
  // qua trang Phân quyền) bị chặn hoàn toàn (403).

  @Get('settings')
  @RequirePermission('audit.manage')
  @ApiOperation({ summary: 'Lấy cấu hình dọn dẹp nhật ký' })
  async getSettings() {
    return this.auditService.getCleanupSettings();
  }

  @Post('settings')
  @RequirePermission('audit.manage')
  @ApiOperation({ summary: 'Cập nhật cấu hình dọn dẹp' })
  async updateSettings(@Body() dto: UpdateAuditSettingsDto, @Req() req: any) {
    return this.auditService.updateCleanupSettings(dto.enabled, dto.retentionDays, req.user.id);
  }

  @Delete('cleanup')
  @RequirePermission('audit.manage')
  @ApiOperation({ summary: 'Xóa nhật ký theo khoảng ngày' })
  async cleanup(@Query() dto: CleanupAuditLogsDto, @Req() req: any) {
    return this.auditService.cleanupByDateRange(dto.from, dto.to, req.user.id);
  }

  @Delete('bulk')
  @RequirePermission('audit.manage')
  @ApiOperation({ summary: 'Xóa nhật ký hàng loạt theo ID' })
  async bulkDelete(@Body() dto: BulkDeleteAuditLogsDto, @Req() req: any) {
    return this.auditService.bulkDelete(dto.ids, req.user.id);
  }
}