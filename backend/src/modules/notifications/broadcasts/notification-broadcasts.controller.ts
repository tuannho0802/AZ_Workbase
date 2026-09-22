import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { GetPermissionScope } from '../../../common/decorators/get-permission-scope.decorator';
import { GetUser } from '../../../common/decorators/get-user.decorator';
import { NotificationBroadcastsService } from './notification-broadcasts.service';
import { PreviewBroadcastDto, SendBroadcastDto } from './dto/send-broadcast.dto';
import { UpdateBroadcastDto } from './dto/update-broadcast.dto';
import {
  ListBroadcastRecipientsDto,
  ListBroadcastsDto,
} from './dto/list-broadcasts.dto';

/**
 * `/notification-broadcasts/*` - Soạn/gửi + quản lý Thông báo THỦ CÔNG. Khác
 * `/notifications/*` (hộp thư cá nhân, chỉ JwtAuthGuard): đây LÀ cấu hình
 * quyền động qua `PermissionGuard` (PLAN mục 6.7).
 *
 * ⚠️ Thứ tự route: `/preview` (POST tĩnh) khai TRƯỚC `:id` để không bị nuốt
 * nhầm (dù ở đây khác method nên không xung đột thật, vẫn giữ thói quen
 * chung của module như `notifications.controller.ts`).
 */
@ApiTags('Notification Broadcasts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('notification-broadcasts')
export class NotificationBroadcastsController {
  constructor(private readonly service: NotificationBroadcastsService) {}

  @Post('preview')
  @RequirePermission('notification_broadcasts.create')
  @ApiOperation({ summary: 'Xem trước số người sẽ nhận - không ghi DB' })
  preview(
    @GetUser('id') userId: number,
    @GetPermissionScope() scope: string | null,
    @Body() dto: PreviewBroadcastDto,
  ) {
    return this.service.preview(userId, scope, dto);
  }

  @Post()
  @RequirePermission('notification_broadcasts.create')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Soạn & gửi thông báo thủ công' })
  send(
    @GetUser('id') userId: number,
    @GetPermissionScope() scope: string | null,
    @Body() dto: SendBroadcastDto,
  ) {
    return this.service.send(userId, scope, dto);
  }

  @Get()
  @RequirePermission('notification_broadcasts.view')
  @ApiOperation({ summary: 'Lịch sử thông báo thủ công đã gửi (cursor pagination)' })
  listSent(
    @GetUser('id') userId: number,
    @GetUser('role') role: string,
    @GetPermissionScope() scope: string | null,
    @Query() query: ListBroadcastsDto,
  ) {
    return this.service.listSent(userId, role, scope, query);
  }

  // ⚠️ Thứ tự route: khai TRƯỚC `:id` (GET tĩnh) để không bị nuốt nhầm thành
  // `id = 'senders'` (mirror lưu ý ở đầu file/`CustomersController#getCreators`).
  @Get('senders')
  @RequirePermission('notification_broadcasts.view')
  @ApiOperation({
    summary:
      'Danh sách "Người gửi" đã từng gửi >=1 thông báo, dùng cho dropdown filter ở "Thông báo đã gửi"',
  })
  getSenders(
    @GetUser('id') userId: number,
    @GetUser('role') role: string,
    @GetPermissionScope() scope: string | null,
  ) {
    return this.service.getSendersList(userId, role, scope);
  }

  @Get(':id')
  @RequirePermission('notification_broadcasts.view')
  @ApiOperation({ summary: 'Chi tiết 1 lần gửi + thống kê đọc/chưa đọc' })
  getOne(
    @GetUser('id') userId: number,
    @GetUser('role') role: string,
    @GetPermissionScope() scope: string | null,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getOne(id, userId, role, scope);
  }

  @Get(':id/recipients')
  @RequirePermission('notification_broadcasts.view')
  @ApiOperation({ summary: 'Danh sách người nhận + trạng thái đọc/chưa đọc' })
  listRecipients(
    @GetUser('id') userId: number,
    @GetUser('role') role: string,
    @GetPermissionScope() scope: string | null,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListBroadcastRecipientsDto,
  ) {
    return this.service.listRecipients(id, userId, role, scope, query);
  }

  @Patch(':id')
  @RequirePermission('notification_broadcasts.edit')
  @ApiOperation({
    summary: 'Sửa tiêu đề/nội dung 1 lần đã gửi - người nhận thấy nhãn "Đã chỉnh sửa"',
  })
  update(
    @GetUser('id') userId: number,
    @GetUser('role') role: string,
    @GetPermissionScope() scope: string | null,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBroadcastDto,
  ) {
    return this.service.update(id, userId, role, scope, dto);
  }

  @Delete(':id')
  @RequirePermission('notification_broadcasts.delete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Xoá hẳn 1 lần gửi - thông báo mất khỏi MỌI hộp thư người nhận',
  })
  remove(
    @GetUser('id') userId: number,
    @GetUser('role') role: string,
    @GetPermissionScope() scope: string | null,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.remove(id, userId, role, scope);
  }
}