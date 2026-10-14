import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GetPermissionScope } from '../../common/decorators/get-permission-scope.decorator';
import { Role } from '../../common/enums/role.enum';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { AuditService } from '../../modules/audit/audit.service';
import { normalizeIp } from '../../common/security/client-ip';
import { LoginIpBlockService } from './login-ip-block.service';
import { SECURITY_CONFIG_LIMITS, SecurityConfigService } from './security-config.service';
import { SecurityActivityService } from './security-activity.service';
import { GetSecurityEventsDto, UpdateSecurityConfigDto } from './dto/security-activity.dto';
import { SECURITY_AUDIT_ACTIONS } from './security-audit';

/**
 * PLAN_RETENTION_SECURITY_ROADMAP P3.3 — Admin xem/mở khoá IP bị khoá đăng nhập.
 * Dùng permission SẴN CÓ `users.manage` (KHÔNG tạo key mới). Khoá IP là dữ liệu TOÀN HỆ THỐNG, không thuộc phòng ban
 * nào nên Manager chỉ có scope `department` không được xem/mở khoá: cần scope `all` (hoặc `role === admin` — lối
 * thoát hiểm cố định, khớp PermissionGuard).
 */
@ApiTags('Security')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('security')
export class SecurityController {
    constructor(
        private readonly ipBlocks: LoginIpBlockService,
        private readonly config: SecurityConfigService,
        private readonly auditService: AuditService,
        private readonly activity: SecurityActivityService,
    ) { }

    private assertGlobalScope(role: string, scope?: string | null) {
        if (role === Role.ADMIN || scope === PermissionScope.ALL) return;
        throw new ForbiddenException('Chỉ người có quyền quản lý nhân viên phạm vi toàn hệ thống mới xem/mở khoá IP.');
    }

    @Get('ip-blocks')
    @RequirePermission('users.manage')
    @ApiOperation({ summary: 'Danh sách IP đang bị khoá đăng nhập + IP sai gần đây (24 giờ), kèm ngưỡng cấu hình' })
    async list(@Req() req: { user: { role: string } }, @GetPermissionScope() scope?: string | null) {
        this.assertGlobalScope(req.user.role, scope);
        const [items, cfg] = await Promise.all([this.ipBlocks.list(), this.config.get()]);
        return {
            items,
            config: {
                ipMaxFailedAttempts: cfg.ipMaxFailedAttempts,
                ipWindowMinutes: cfg.ipWindowMinutes,
                ipLockMinutes: cfg.ipLockMinutes,
            },
        };
    }

    @Delete('ip-blocks/:ip')
    @RequirePermission('users.manage')
    @ApiOperation({ summary: 'Mở khoá 1 IP (xoá bộ đếm + khoá). Ghi audit UNBLOCK_LOGIN_IP' })
    async unblock(
        @Param('ip') ip: string,
        @Req() req: { user: { id: number; role: string } },
        @GetPermissionScope() scope?: string | null,
    ) {
        this.assertGlobalScope(req.user.role, scope);
        if (!normalizeIp(ip)) throw new BadRequestException('Địa chỉ IP không hợp lệ');
        const removed = await this.ipBlocks.unblock(ip);
        if (!removed) throw new NotFoundException('Không có bản ghi cho IP này (có thể đã tự hết khoá).');

        // P4.1: ghi qua `logSecurityEventAsync` để dòng này hiện ở trang Hoạt động bảo mật (entity_type 'security').
    this.auditService.logSecurityEventAsync({
      userId: req.user.id,
      action: 'UNBLOCK_LOGIN_IP',
      entityId: removed.id,
      detail: { ip: removed.ip, failedCount: removed.failedCount, wasLocked: removed.wasLocked },
    });
    return { success: true, message: 'Đã mở khoá IP' };
    }

  // ───────── PLAN Phase 4.3: trang "Hoạt động bảo mật" — tái dùng `audit.manage` (không tạo key mới) ─────────

  @Get('events')
  @RequirePermission('audit.manage')
  @ApiOperation({ summary: 'Sự kiện bảo mật (đăng nhập sai, khoá, mở khoá...) — lọc theo loại/IP/email/ngày, phân trang' })
  events(@Query() filters: GetSecurityEventsDto) {
    return this.activity.listEvents(filters);
  }

  @Get('summary')
  @RequirePermission('audit.manage')
  @ApiOperation({ summary: 'Thẻ tổng hợp: số lần khoá hôm nay, IP đang khoá, email lạ bị thử nhiều nhất (7 ngày)' })
  summary() {
    return this.activity.summary();
  }

  @Get('actions')
  @RequirePermission('audit.manage')
  @ApiOperation({ summary: 'Danh sách loại sự kiện bảo mật (cho ô lọc)' })
  actions() {
    return [...SECURITY_AUDIT_ACTIONS];
  }

  @Get('config')
  @RequirePermission('audit.manage')
  @ApiOperation({ summary: 'Cấu hình bảo mật đăng nhập hiện hành + khoảng hợp lệ của từng giá trị' })
  async getConfig() {
    return { config: await this.config.get(), limits: SECURITY_CONFIG_LIMITS };
  }

  @Put('config')
  @RequirePermission('audit.manage')
  @ApiOperation({ summary: 'Sửa cấu hình bảo mật đăng nhập. Ghi audit UPDATE_SECURITY_CONFIG (giá trị cũ/mới). Hiệu lực ≤ 30 giây' })
  async updateConfig(@Body() dto: UpdateSecurityConfigDto, @Req() req: { user: { id: number }; ip?: string; headers?: Record<string, unknown> }) {
    const { before, after, changed } = await this.config.update(dto, req.user.id);
    if (changed.length > 0) {
      const ua = typeof req.headers?.['user-agent'] === 'string' ? (req.headers['user-agent'] as string) : null;
      this.auditService.logSecurityEventAsync({
        userId: req.user.id,
        action: 'UPDATE_SECURITY_CONFIG',
        ip: normalizeIp(req.ip),
        userAgent: ua,
        detail: {
          changed,
          before: Object.fromEntries(changed.map((k) => [k, before[k]])),
          after: Object.fromEntries(changed.map((k) => [k, after[k]])),
        },
      });
    }
    return { config: after, changed };
  }
}