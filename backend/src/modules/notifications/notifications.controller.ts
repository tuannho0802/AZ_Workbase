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
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách thông báo của tôi (cursor pagination)' })
  list(@GetUser('id') userId: number, @Query() query: ListNotificationsDto) {
    return this.notificationsService.list(userId, query);
  }

  @Get('poll')
  @ApiOperation({
    summary: 'Số chưa đọc + version - endpoint polling nhẹ (60s)',
  })
  poll(@GetUser('id') userId: number) {
    return this.notificationsService.poll(userId);
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

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Xoá thông báo tự động / ẩn thông báo thủ công khỏi hộp thư của tôi',
  })
  remove(@GetUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.notificationsService.remove(userId, id);
  }
}
