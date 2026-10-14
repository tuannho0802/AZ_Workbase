import { BadRequestException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GetPermissionScope } from '../../common/decorators/get-permission-scope.decorator';
import { Role } from '../../common/enums/role.enum';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { AuditService } from '../audit/audit.service';
import { normalizeIp } from '../../common/security/client-ip';
import { LoginIpBlockService } from './login-ip-block.service';
import { SecurityConfigService } from './security-config.service';

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

        this.auditService.logActionAsync(req.user.id, 'UNBLOCK_LOGIN_IP', 'security', removed.id, null, {
            ip: removed.ip,
            failedCount: removed.failedCount,
            wasLocked: removed.wasLocked,
        });
        return { success: true, message: 'Đã mở khoá IP' };
    }
}