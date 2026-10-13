import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { SidebarBadgesService } from './sidebar-badges.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionsVersionService } from '../permissions/permissions-version.service';

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
  private readonly logger = new Logger(SidebarBadgesController.name);
  /** Chỉ log cảnh báo tối đa 1 lần / 10 phút / instance để không tự tạo thêm tải. */
  private lastDeprecatedWarnAt = 0;

  constructor(
    private readonly sidebarBadgesService: SidebarBadgesService,
    private readonly notificationsService: NotificationsService,
    private readonly permissionsVersionService: PermissionsVersionService,
  ) {}

  /**
   * [PLAN CPU Mục 10C] GỘP `/notifications/poll` + `/sidebar/badges` thành 1 request (chỉ chạy JwtStrategy 1 lần).
   * Trả đúng hình dạng `/notifications/poll` (unread, version, permSig, refSig) + `badges`.
   * `/notifications/poll` và `/sidebar/badges` GIỮ NGUYÊN để FE cũ vẫn chạy. Lỗi đếm badge KHÔNG làm hỏng poll.
   */
  @Get('poll')
  @ApiOperation({ summary: 'Gộp poll thông báo + badge sidebar (1 request).' })
  async poll(@GetUser() user: any) {
    const [base, permSig, refSig, epoch, badges] = await Promise.all([
      this.notificationsService.poll(user.id),
      this.permissionsVersionService.buildSig(user),
      this.permissionsVersionService.getRefSig(),
      this.permissionsVersionService.getEpoch(),
      this.sidebarBadgesService.getBadges(user).catch(() => undefined),
    ]);
    return {
      ...base,
      ...(permSig === undefined ? {} : { permSig }),
      ...(refSig === undefined ? {} : { refSig }),
      // [Reset hệ thống] epoch đổi = Root Admin vừa bấm Reset -> FE làm mới toàn bộ cache.
      ...(epoch === undefined ? {} : { epoch }),
      ...(badges === undefined ? {} : { badges }),
    };
  }

  @Get('badges')
  @ApiOperation({
    summary:
      'Số đếm cho badge sidebar (gộp). Field chỉ có khi người gọi có permission tương ứng.',
  })
  getBadges(@GetUser() user: any) {
    // [AGENT] NEW: FE hiện tại dùng /sidebar/poll (từ 2026-10-07). Ghi vết để biết còn client cũ nào gọi trước khi quyết định xoá endpoint này.
    const now = Date.now();
    if (now - this.lastDeprecatedWarnAt > 10 * 60_000) {
      this.lastDeprecatedWarnAt = now;
      this.logger.warn(`[Deprecated] GET /sidebar/badges vẫn được gọi (user=${user?.id}) - FE hiện tại dùng /sidebar/poll.`);
    }
    return this.sidebarBadgesService.getBadges(user);
  }
}
