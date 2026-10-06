import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { SidebarBadgesService } from './sidebar-badges.service';

/**
 * GỘP 7 request polling badge sidebar thành 1 (chỉ chạy JwtStrategy 1 lần
 * thay vì 7). KHÔNG gắn `@RequirePermission` - quyền được kiểm TỪNG badge bên
 * trong service (thiếu quyền -> field vắng mặt), nên chỉ cần `JwtAuthGuard`.
 */
@ApiTags('Sidebar Badges')
@ApiBearerAuth()
@Controller('sidebar')
@UseGuards(JwtAuthGuard)
export class SidebarBadgesController {
  constructor(private readonly sidebarBadgesService: SidebarBadgesService) {}

  @Get('badges')
  @ApiOperation({
    summary:
      'Số đếm cho badge sidebar (gộp). Field chỉ có khi người gọi có permission tương ứng.',
  })
  getBadges(@GetUser() user: any) {
    return this.sidebarBadgesService.getBadges(user);
  }
}
