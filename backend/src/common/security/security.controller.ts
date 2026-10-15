import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
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
import { LoginIpWhitelistService } from './login-ip-whitelist.service';
import { IpGeoService } from './ip-geo.service';
import { IpAccessLogService } from './ip-access-log.service';
import { SECURITY_CONFIG_LIMITS, SecurityConfigService } from './security-config.service';
import { SecurityActivityService } from './security-activity.service';
import { AddIpWhitelistDto, GetIpAccessDetailDto, GetIpAccessDto, GetSecurityEventsDto, SetIpCountryDto, UpdateSecurityConfigDto } from './dto/security-activity.dto';
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
        private readonly whitelist: LoginIpWhitelistService,
        private readonly config: SecurityConfigService,
        private readonly auditService: AuditService,
        private readonly activity: SecurityActivityService,
        private readonly ipGeo: IpGeoService,
        private readonly ipAccess: IpAccessLogService,
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
        const [rawItems, cfg] = await Promise.all([this.ipBlocks.list(), this.config.get()]);
        const items = await this.ipGeo.enrich(rawItems, 'ip');
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

  // ───────── P3.5: whitelist IP (miễn khoá theo IP; khoá email/tài khoản vẫn như thường). Cùng quyền với `ip-blocks`. ─────────

  @Get('ip-whitelist')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Danh sách IP được miễn khoá theo IP, kèm IP hiện tại của người gọi (myIp)' })
  async listWhitelist(@Req() req: { user: { role: string }; ip?: string }, @GetPermissionScope() scope?: string | null) {
    this.assertGlobalScope(req.user.role, scope);
    const myIp = normalizeIp(req.ip);
    const items = await this.ipGeo.enrich(await this.whitelist.list(), 'ip');
    const [me] = await this.ipGeo.enrich([{ ip: myIp }], 'ip');
    return { items, myIp, myIpCountryCode: me.countryCode, myIpKind: me.ipKind };
  }

  @Post('ip-whitelist')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Thêm IP vào whitelist (đồng thời gỡ khoá/bộ đếm hiện có của IP đó). Ghi audit IP_WHITELIST_ADDED' })
  async addWhitelist(
    @Body() dto: AddIpWhitelistDto,
    @Req() req: { user: { id: number; role: string }; ip?: string; headers?: Record<string, unknown> },
    @GetPermissionScope() scope?: string | null,
  ) {
    this.assertGlobalScope(req.user.role, scope);
    if (!normalizeIp(dto.ip)) throw new BadRequestException('Địa chỉ IP không hợp lệ');
    const added = await this.whitelist.add(dto.ip, dto.note ?? null, req.user.id);
    const ua = typeof req.headers?.['user-agent'] === 'string' ? (req.headers['user-agent'] as string) : null;
    this.auditService.logSecurityEventAsync({
      userId: req.user.id,
      action: 'IP_WHITELIST_ADDED',
      entityId: added.id || undefined,
      ip: normalizeIp(req.ip),
      userAgent: ua,
      detail: { whitelistedIp: added.ip, note: dto.note ?? null, clearedBlock: added.clearedBlock },
    });
    return { success: true, message: 'Đã thêm IP vào whitelist', ip: added.ip, clearedBlock: added.clearedBlock };
  }

  @Delete('ip-whitelist/:ip')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Gỡ IP khỏi whitelist. Ghi audit IP_WHITELIST_REMOVED' })
  async removeWhitelist(
    @Param('ip') ip: string,
    @Req() req: { user: { id: number; role: string }; ip?: string; headers?: Record<string, unknown> },
    @GetPermissionScope() scope?: string | null,
  ) {
    this.assertGlobalScope(req.user.role, scope);
    if (!normalizeIp(ip)) throw new BadRequestException('Địa chỉ IP không hợp lệ');
    const removed = await this.whitelist.remove(ip);
    if (!removed) throw new NotFoundException('IP này không có trong whitelist.');
    const ua = typeof req.headers?.['user-agent'] === 'string' ? (req.headers['user-agent'] as string) : null;
    this.auditService.logSecurityEventAsync({
      userId: req.user.id,
      action: 'IP_WHITELIST_REMOVED',
      entityId: removed.id,
      ip: normalizeIp(req.ip),
      userAgent: ua,
      detail: { whitelistedIp: removed.ip },
    });
    return { success: true, message: 'Đã gỡ IP khỏi whitelist' };
  }

  // ───────── P3.6: quốc gia của IP (sửa tay) + theo dõi lượt truy cập IP. Cùng quyền với `ip-blocks`. ─────────

  @Put('ip-geo/:ip')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Admin gán quốc gia thủ công cho 1 IP (source=manual, không bị header Vercel ghi đè). Audit IP_COUNTRY_SET' })
  async setIpCountry(
    @Param('ip') ip: string,
    @Body() dto: SetIpCountryDto,
    @Req() req: { user: { id: number; role: string }; ip?: string; headers?: Record<string, unknown> },
    @GetPermissionScope() scope?: string | null,
  ) {
    this.assertGlobalScope(req.user.role, scope);
    const res = await this.ipGeo.setManual(ip, dto.countryCode, req.user.id);
    const ua = typeof req.headers?.['user-agent'] === 'string' ? (req.headers['user-agent'] as string) : null;
    this.auditService.logSecurityEventAsync({
      userId: req.user.id, action: 'IP_COUNTRY_SET', ip: normalizeIp(req.ip), userAgent: ua,
      detail: { targetIp: res.ip, before: res.before, after: res.after },
    });
    return { success: true, ip: res.ip, countryCode: res.after };
  }

  @Delete('ip-geo/:ip')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Xoá bản sửa tay quốc gia của IP. Audit IP_COUNTRY_CLEARED' })
  async clearIpCountry(
    @Param('ip') ip: string,
    @Req() req: { user: { id: number; role: string }; ip?: string; headers?: Record<string, unknown> },
    @GetPermissionScope() scope?: string | null,
  ) {
    this.assertGlobalScope(req.user.role, scope);
    const res = await this.ipGeo.clearManual(ip);
    if (!res) throw new NotFoundException('IP này không có bản sửa tay quốc gia.');
    const ua = typeof req.headers?.['user-agent'] === 'string' ? (req.headers['user-agent'] as string) : null;
    this.auditService.logSecurityEventAsync({
      userId: req.user.id, action: 'IP_COUNTRY_CLEARED', ip: normalizeIp(req.ip), userAgent: ua,
      detail: { targetIp: res.ip, before: res.before },
    });
    return { success: true };
  }

  @Get('ip-access')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Theo dõi IP: danh sách IP đã đăng nhập/làm mới phiên kèm số lần (đọc từ bảng tổng hợp)' })
  async listIpAccess(@Query() q: GetIpAccessDto, @Req() req: { user: { role: string } }, @GetPermissionScope() scope?: string | null) {
    this.assertGlobalScope(req.user.role, scope);
    const res = await this.ipAccess.list({ status: q.status, search: q.search, page: q.page ?? 1, limit: q.limit ?? 20 });
    return { ...res, items: await this.ipGeo.enrich(res.items, 'ip') };
  }

  @Get('ip-access/:ip')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Lịch sử truy cập của 1 IP: tóm tắt + log phân trang' })
  async ipAccessDetail(
    @Param('ip') ip: string,
    @Query() q: GetIpAccessDetailDto,
    @Req() req: { user: { role: string } },
    @GetPermissionScope() scope?: string | null,
  ) {
    this.assertGlobalScope(req.user.role, scope);
    if (!normalizeIp(ip)) throw new BadRequestException('Địa chỉ IP không hợp lệ');
    const res = await this.ipAccess.detail(ip, { page: q.page ?? 1, limit: q.limit ?? 20, outcome: q.outcome, from: q.fromDate, to: q.toDate });
    if (!res) throw new NotFoundException('Chưa có lượt truy cập nào được ghi nhận cho IP này.');
    const [geo] = await this.ipGeo.enrich([{ ip: res.ip }], 'ip');
    return { ...res, countryCode: geo.countryCode, ipKind: geo.ipKind, geoSource: geo.geoSource };
  }

  // ───────── PLAN Phase 4.3: trang "Hoạt động bảo mật" — tái dùng `audit.manage` (không tạo key mới) ─────────

  @Get('events')
  @RequirePermission('audit.manage')
  @ApiOperation({ summary: 'Sự kiện bảo mật (đăng nhập sai, khoá, mở khoá...) — lọc theo loại/IP/email/ngày, phân trang' })
  async events(@Query() filters: GetSecurityEventsDto) {
    const res = await this.activity.listEvents(filters);
    return { ...res, data: await this.ipGeo.enrich(res.data as any[], 'ipAddress') };
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