import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { FanpagesService } from './fanpages.service';
import { FanpagePostsService } from './fanpage-posts.service';
import { FanpageNotesService } from './fanpage-notes.service';
import { FanpagePlatformsService } from './fanpage-platforms.service';
import { FanpageHealthStatusesService } from './fanpage-health-statuses.service';
import { FanpageOverviewService } from './fanpage-overview.service';
import { FanpageHistoryService } from './fanpage-history.service';
import { FanpageTodayService } from './fanpage-today.service';
import { CreateFanpageDto, UpdateFanpageDto, FanpageQueryDto } from './dto/fanpage.dto';
import { CreateFanpagePostDto, UpdateFanpagePostDto, FanpageNoteDto } from './dto/fanpage-post.dto';
import { CreateFanpagePlatformDto, UpdateFanpagePlatformDto } from './dto/fanpage-platform.dto';
import { CreateFanpageHealthStatusDto, UpdateFanpageHealthStatusDto } from './dto/fanpage-health-status.dto';
import type { FanpageCaller } from './fanpage-access.service';

/**
 * Fanpage (nhân viên tự quản lý Page). MỌI route đều có @RequirePermission; dữ liệu lọc theo scope người phụ trách
 * (own/department/all) ở service. Route tĩnh (`owner-options`, `overview`, `today`) khai TRƯỚC `:id` (Nest khớp theo thứ tự;
 * ngược lại `ParseIntPipe` bắt chữ "overview" -> 400 - PLAN X18, có spec khoá thứ tự).
 */
@ApiTags('Fanpages (Page của nhân viên)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('fanpages')
export class FanpagesController {
  constructor(
    private readonly service: FanpagesService,
    private readonly overviewService: FanpageOverviewService,
    private readonly historyService: FanpageHistoryService,
    private readonly todayService: FanpageTodayService,
  ) {}

  @Get()
  @RequirePermission('fanpages.view')
  @ApiOperation({ summary: 'Danh sách Page theo scope fanpages.view, kèm cờ quyền theo từng Page' })
  list(@Query() query: FanpageQueryDto, @GetUser() user: FanpageCaller) {
    return this.service.list(user, query);
  }

  @Get('owner-options')
  @RequirePermission('fanpages.view')
  @ApiOperation({ summary: 'Nhân viên có thể được giao Page (theo scope fanpages.edit)' })
  ownerOptions(@GetUser() user: FanpageCaller) {
    return this.service.ownerOptions(user);
  }

  @Get('overview')
  @RequirePermission('fanpages.view')
  @ApiOperation({ summary: 'Số cho thẻ KPI (cùng scope + cùng nguồn nhịp đăng với danh sách)' })
  overview(@GetUser() user: FanpageCaller) {
    return this.overviewService.overview(user);
  }

  @Get('today')
  @RequirePermission('fanpages.view')
  @ApiOperation({ summary: 'Tab "Hôm nay": Page cần đăng bài / đã đăng hôm nay / đang ổn (cùng scope + nguồn nhịp đăng với danh sách)' })
  today(@GetUser() user: FanpageCaller) {
    return this.todayService.today(user);
  }

  @Post()
  @RequirePermission('fanpages.create')
  @ApiOperation({ summary: 'Thêm Page mới (mặc định người tạo là người phụ trách)' })
  create(@Body() dto: CreateFanpageDto, @GetUser() user: FanpageCaller) {
    return this.service.create(dto, user);
  }

  @Get(':id')
  @RequirePermission('fanpages.view')
  @ApiOperation({ summary: 'Chi tiết 1 Page' })
  findOne(@Param('id', ParseIntPipe) id: number, @GetUser() user: FanpageCaller) {
    return this.service.findOne(id, user);
  }

  @Get(':id/history')
  @RequirePermission('fanpages.view')
  @ApiOperation({ summary: 'Lịch sử đổi người phụ trách / tình trạng / theo dõi / lưu trữ của Page' })
  history(@Param('id', ParseIntPipe) id: number, @GetUser() user: FanpageCaller) {
    return this.historyService.list(id, user);
  }

  @Patch(':id/archive')
  @RequirePermission('fanpages.edit')
  @ApiOperation({ summary: 'Lưu trữ Page (ẩn khỏi danh sách, ngầm tắt theo dõi, giữ lịch sử)' })
  archive(@Param('id', ParseIntPipe) id: number, @GetUser() user: FanpageCaller) {
    return this.service.archive(id, user);
  }

  @Patch(':id/unarchive')
  @RequirePermission('fanpages.edit')
  @ApiOperation({ summary: 'Bỏ lưu trữ Page' })
  unarchive(@Param('id', ParseIntPipe) id: number, @GetUser() user: FanpageCaller) {
    return this.service.unarchive(id, user);
  }

  @Patch(':id')
  @RequirePermission('fanpages.edit')
  @ApiOperation({ summary: 'Sửa Page (tên/link/nền tảng/theo dõi/tình trạng/mục tiêu tuần/người phụ trách)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFanpageDto, @GetUser() user: FanpageCaller) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('fanpages.delete')
  @ApiOperation({ summary: 'Xoá Page kèm bài đăng + ghi chú (mặc định chỉ Admin)' })
  remove(@Param('id', ParseIntPipe) id: number, @GetUser() user: FanpageCaller) {
    return this.service.remove(id, user);
  }
}

@ApiTags('Fanpage - Bài đăng')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('fanpages/:fanpageId/posts')
export class FanpagePostsController {
  constructor(private readonly service: FanpagePostsService) {}

  @Get()
  @RequirePermission('fanpages.view')
  @ApiOperation({ summary: 'Danh sách bài đăng của Page' })
  list(@Param('fanpageId', ParseIntPipe) fanpageId: number, @GetUser() user: FanpageCaller) {
    return this.service.list(fanpageId, user);
  }

  @Post()
  @RequirePermission('fanpage_posts.manage')
  @ApiOperation({ summary: 'Thêm bài đăng (ghi tay)' })
  create(@Param('fanpageId', ParseIntPipe) fanpageId: number, @Body() dto: CreateFanpagePostDto, @GetUser() user: FanpageCaller) {
    return this.service.create(fanpageId, dto, user);
  }

  @Patch(':postId')
  @RequirePermission('fanpage_posts.manage')
  @ApiOperation({ summary: 'Sửa bài đăng' })
  update(
    @Param('fanpageId', ParseIntPipe) fanpageId: number,
    @Param('postId', ParseIntPipe) postId: number,
    @Body() dto: UpdateFanpagePostDto,
    @GetUser() user: FanpageCaller,
  ) {
    return this.service.update(fanpageId, postId, dto, user);
  }

  @Delete(':postId')
  @RequirePermission('fanpage_posts.delete')
  @ApiOperation({ summary: 'Xoá bài đăng (mặc định chỉ Admin)' })
  remove(@Param('fanpageId', ParseIntPipe) fanpageId: number, @Param('postId', ParseIntPipe) postId: number, @GetUser() user: FanpageCaller) {
    return this.service.remove(fanpageId, postId, user);
  }
}

@ApiTags('Fanpage - Ghi chú tiến trình')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('fanpages/:fanpageId/notes')
export class FanpageNotesController {
  constructor(private readonly service: FanpageNotesService) {}

  @Get()
  @RequirePermission('fanpages.view')
  @ApiOperation({ summary: 'Timeline ghi chú của Page (mới nhất trước)' })
  list(@Param('fanpageId', ParseIntPipe) fanpageId: number, @GetUser() user: FanpageCaller) {
    return this.service.list(fanpageId, user);
  }

  @Post()
  @RequirePermission('fanpage_notes.manage')
  @ApiOperation({ summary: 'Thêm ghi chú tiến trình' })
  create(@Param('fanpageId', ParseIntPipe) fanpageId: number, @Body() dto: FanpageNoteDto, @GetUser() user: FanpageCaller) {
    return this.service.create(fanpageId, dto, user);
  }

  @Patch(':noteId')
  @RequirePermission('fanpage_notes.manage')
  @ApiOperation({ summary: 'Sửa ghi chú' })
  update(
    @Param('fanpageId', ParseIntPipe) fanpageId: number,
    @Param('noteId', ParseIntPipe) noteId: number,
    @Body() dto: FanpageNoteDto,
    @GetUser() user: FanpageCaller,
  ) {
    return this.service.update(fanpageId, noteId, dto, user);
  }

  @Delete(':noteId')
  @RequirePermission('fanpage_notes.delete')
  @ApiOperation({ summary: 'Xoá ghi chú (mặc định chỉ Admin)' })
  remove(@Param('fanpageId', ParseIntPipe) fanpageId: number, @Param('noteId', ParseIntPipe) noteId: number, @GetUser() user: FanpageCaller) {
    return this.service.remove(fanpageId, noteId, user);
  }
}

@ApiTags('Fanpage - Nền tảng')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('fanpage-platforms')
export class FanpagePlatformsController {
  constructor(private readonly service: FanpagePlatformsService) {}

  @Get()
  @RequirePermission('fanpages.view')
  @ApiOperation({ summary: 'Danh sách nền tảng (activeOnly=true -> chỉ nền tảng chưa khoá)' })
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.service.findAll(activeOnly === 'true');
  }

  @Post()
  @RequirePermission('fanpage_platforms.manage')
  @ApiOperation({ summary: 'Thêm nền tảng' })
  create(@Body() dto: CreateFanpagePlatformDto, @GetUser() user: FanpageCaller) {
    return this.service.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('fanpage_platforms.manage')
  @ApiOperation({ summary: 'Sửa tên/màu/thứ tự nền tảng' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFanpagePlatformDto, @GetUser() user: FanpageCaller) {
    return this.service.update(id, dto, user.id);
  }

  @Patch(':id/lock')
  @RequirePermission('fanpage_platforms.manage')
  @ApiOperation({ summary: 'Khoá nền tảng (không chọn được cho Page mới)' })
  lock(@Param('id', ParseIntPipe) id: number, @GetUser() user: FanpageCaller) {
    return this.service.lock(id, user.id);
  }

  @Patch(':id/unlock')
  @RequirePermission('fanpage_platforms.manage')
  @ApiOperation({ summary: 'Mở khoá nền tảng' })
  unlock(@Param('id', ParseIntPipe) id: number, @GetUser() user: FanpageCaller) {
    return this.service.unlock(id, user.id);
  }
}

@ApiTags('Fanpage - Tình trạng Page')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('fanpage-health-statuses')
export class FanpageHealthStatusesController {
  constructor(private readonly service: FanpageHealthStatusesService) {}

  @Get()
  @RequirePermission('fanpages.view')
  @ApiOperation({ summary: 'Danh sách tình trạng Page (activeOnly=true -> chỉ tình trạng chưa khoá)' })
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.service.findAll(activeOnly === 'true');
  }

  @Post()
  @RequirePermission('fanpage_statuses.manage')
  @ApiOperation({ summary: 'Thêm tình trạng Page' })
  create(@Body() dto: CreateFanpageHealthStatusDto, @GetUser() user: FanpageCaller) {
    return this.service.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('fanpage_statuses.manage')
  @ApiOperation({ summary: 'Sửa tên/màu/thứ tự/cờ ngưng hoạt động của tình trạng' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFanpageHealthStatusDto, @GetUser() user: FanpageCaller) {
    return this.service.update(id, dto, user.id);
  }

  @Patch(':id/lock')
  @RequirePermission('fanpage_statuses.manage')
  @ApiOperation({ summary: 'Khoá tình trạng (không chọn được cho Page; không khoá được dòng mặc định)' })
  lock(@Param('id', ParseIntPipe) id: number, @GetUser() user: FanpageCaller) {
    return this.service.lock(id, user.id);
  }

  @Patch(':id/unlock')
  @RequirePermission('fanpage_statuses.manage')
  @ApiOperation({ summary: 'Mở khoá tình trạng' })
  unlock(@Param('id', ParseIntPipe) id: number, @GetUser() user: FanpageCaller) {
    return this.service.unlock(id, user.id);
  }
}
