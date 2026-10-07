import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { NotificationsService } from './notifications.service';
import {
  PermissionsVersionService,
  PermissionSigUser,
} from '../permissions/permissions-version.service';
import {
  ListNotificationsDto,
  ReadAllNotificationsDto,
} from './dto/list-notifications.dto';

/**
 * HỘP THƯ CÁ NHÂN - chỉ cần đăng nhập (JwtAuthGuard), CỐ Ý KHÔNG gắn
 * `@RequirePermission` (PLAN 6.5, PermissionGuard cho qua khi không khai key):
 * mọi user đã đăng nhập đều có hộp thư của CHÍNH MÌNH.
 *
 * ⚠️ IDOR: `recipientId` LUÔN lấy từ JWT (`@GetUser('id')`), tuyệt đối không
 * nhận từ param/body/query. Đọc/sửa/xoá thông báo của người khác → 404.
 *
 * ⚠️ Thứ tự route: `poll` và `read-all` PHẢI khai báo TRƯỚC `:id/...`.
 */
@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly permissionsVersionService: PermissionsVersionService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách thông báo của tôi (cursor pagination)' })
  list(@GetUser('id') userId: number, @Query() query: ListNotificationsDto) {
    return this.notificationsService.list(userId, query);
  }

  @Get('poll')
  @ApiOperation({
    summary: 'Số chưa đọc + version - endpoint polling nhẹ (60s)',
  })
  async poll(@GetUser() user: PermissionSigUser & { id: number }) {
    // [AGENT] OLD CODE (giữ lại để rollback): chỉ `permSig`:
    // const [base, permSig] = await Promise.all([this.notificationsService.poll(user.id), this.permissionsVersionService.buildSig(user)]);
    // return permSig === undefined ? base : { ...base, permSig };
    // [AGENT] NEW CODE (9D): thêm `refSig` (phiên bản từng danh mục ít đổi). `permSig` và `refSig` dùng CHUNG 1 lần đọc settings (cache 10 s).
    const [base, permSig, refSig, epoch] = await Promise.all([
      this.notificationsService.poll(user.id),
      this.permissionsVersionService.buildSig(user),
      this.permissionsVersionService.getRefSig(),
      this.permissionsVersionService.getEpoch(),
    ]);
    return {
      ...base,
      ...(permSig === undefined ? {} : { permSig }),
      ...(refSig === undefined ? {} : { refSig }),
      // [Reset hệ thống] xem /sidebar/poll.
      ...(epoch === undefined ? {} : { epoch }),
    };
  }

  @Patch('read-all')
  @ApiOperation({
    summary: 'Đánh dấu tất cả đã đọc (có thể lọc theo category)',
  })
  readAll(
    @GetUser('id') userId: number,
    @Query() query: ReadAllNotificationsDto,
  ) {
    return this.notificationsService.markAllRead(userId, query.category);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Đánh dấu 1 thông báo đã đọc (idempotent)' })
  markRead(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.notificationsService.markRead(userId, id);
  }

  @Patch(':id/restore')
  @ApiOperation({
    summary: 'Khôi phục 1 thông báo thủ công đã ẩn (đảo ngược DELETE :id)',
  })
  restore(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.notificationsService.restore(userId, id);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Ẩn thông báo khỏi hộp thư của tôi (khôi phục được ở tab "Đã ẩn")',
  })
  remove(@GetUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.notificationsService.remove(userId, id);
  }

  @Delete(':id/permanent')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Xoá VĨNH VIỄN 1 thông báo đã ẩn (không thể khôi phục) - chỉ dùng ở tab "Đã ẩn"',
  })
  purge(@GetUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.notificationsService.purge(userId, id);
  }
}