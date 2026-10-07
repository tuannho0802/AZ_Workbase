import { Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RootAdminGuard } from '../../common/guards/root-admin.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { SystemService } from './system.service';

/**
 * ⚠️ KHÔNG dùng `@RequirePermission` - cố ý hardcode `RootAdminGuard` (role=admin VÀ isRootAdmin=true), đúng yêu cầu
 * "chỉ Root Admin", không cấp được qua trang Phân quyền.
 */
@ApiTags('System')
@ApiBearerAuth()
@Controller('system')
@UseGuards(JwtAuthGuard, RootAdminGuard)
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

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
