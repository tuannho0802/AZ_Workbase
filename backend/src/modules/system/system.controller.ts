import { Controller, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RootAdminGuard } from '../../common/guards/root-admin.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { SystemService } from './system.service';
import { SystemHealthService } from './system-health.service';

/**
 * ⚠️ KHÔNG dùng `@RequirePermission` - cố ý hardcode `RootAdminGuard` (role=admin VÀ isRootAdmin=true), đúng yêu cầu
 * "chỉ Root Admin", không cấp được qua trang Phân quyền.
 */
@ApiTags('System')
@ApiBearerAuth()
@Controller('system')
@UseGuards(JwtAuthGuard, RootAdminGuard)
export class SystemController {
  constructor(
    private readonly systemService: SystemService,
    private readonly healthService: SystemHealthService,
  ) {}

  @Get('health')
  @ApiOperation({
    summary: 'Sức khoẻ hệ thống (chỉ đọc, chỉ Root Admin): dung lượng bảng, cron retention, cache, phiên, DB. `fresh=1` bỏ qua cache bảng 5 phút (tối thiểu cách 30 giây).',
  })
  health(@Query('fresh') fresh?: string) {
    return this.healthService.getHealth({ fresh: fresh === '1' || fresh === 'true' });
  }

  @Post('reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset hệ thống: buộc mọi client làm mới toàn bộ cache (chỉ Root Admin, cooldown 30s).' })
  reset(@GetUser() user: { id: number }, @Req() req: { headers: Record<string, string | string[] | undefined>; ip?: string }) {
    const ua = req.headers['user-agent'];
    const fwd = req.headers['x-az-client-ip'];
    const ip = (Array.isArray(fwd) ? fwd[0] : fwd) ?? req.ip;
    return this.systemService.reset(user, ip, Array.isArray(ua) ? ua[0] : ua);
  }
}
