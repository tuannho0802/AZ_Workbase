import { Controller, Get, Post, Patch, Put, Delete, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
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
import { CreateFanpagePostDto, UpdateFanpagePostDto, FanpageNoteDto, FanpageLeadDto, FanpageLeadsQueryDto } from './dto/fanpage-post.dto';
import { FanpageLeadsService } from './fanpage-leads.service';
import { CreateFanpagePlatformDto, UpdateFanpagePlatformDto } from './dto/fanpage-platform.dto';
import { CreateFanpageHealthStatusDto, UpdateFanpageHealthStatusDto } from './dto/fanpage-health-status.dto';
import { FanpageMetricsService } from './fanpage-metrics.service';
import { FanpageStatsService } from './fanpage-stats.service';
import { FanpageUtmsService } from './fanpage-utms.service';
import { FanpageOutcomesService } from './fanpage-outcomes.service';
import { OutcomeCustomersQueryDto, OutcomesQueryDto, SetFanpageUtmsDto } from './dto/fanpage-utm.dto';
import {
  BulkSnapshotDto,
  GridQueryDto,
  GrowthQueryDto,
  HeatmapQueryDto,
  SetTargetDto,
  SnapshotListQueryDto,
  StatsRangeQueryDto,
  TopPostsQueryDto,
  UpsertSnapshotDto,
} from './dto/fanpage-metrics.dto';
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
    private readonly utmLinks: FanpageUtmsService,
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

  @Put(':id/utms')
  @RequirePermission('fanpages.edit')
  @ApiOperation({ summary: 'Thay toàn bộ UTM gắn cho Page (Page đầu tiên gắn UTM tự thành Page chính; gỡ Page chính khi còn Page khác → 409)' })
  setUtms(@Param('id', ParseIntPipe) id: number, @Body() dto: SetFanpageUtmsDto, @GetUser() user: FanpageCaller) {
    return this.utmLinks.setUtms(id, dto.utmIds, user);
  }

  @Patch(':id/utms/:utmId/primary')
  @RequirePermission('fanpages.edit')
  @ApiOperation({ summary: 'Đặt Page này làm Page chính (ghi công) của UTM - cần quyền sửa cả Page chính hiện tại' })
  setPrimaryUtm(@Param('id', ParseIntPipe) id: number, @Param('utmId', ParseIntPipe) utmId: number, @GetUser() user: FanpageCaller) {
    return this.utmLinks.setPrimary(id, utmId, user);
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

/**
 * Thống kê (tab "Thống kê"). Controller này PHẢI đăng ký TRƯỚC `FanpagePostsController` trong module:
 * `GET /fanpages/stats/posts` sẽ bị route `fanpages/:fanpageId/posts` bắt (ParseIntPipe -> 400) nếu đứng sau (PLAN X18, có spec khoá thứ tự).
 */
@ApiTags('Fanpage - Thống kê')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('fanpages/stats')
export class FanpageStatsController {
  constructor(
    private readonly service: FanpageStatsService,
    private readonly outcomes: FanpageOutcomesService,
  ) {}

  @Get('growth')
  @RequirePermission('fanpage_stats.view')
  @ApiOperation({ summary: 'Chuỗi follower tổng (+ Page so sánh) theo tuần/tháng - số liệu nhập tay, carry-forward' })
  growth(@Query() query: GrowthQueryDto, @GetUser() user: FanpageCaller) {
    return this.service.growth(user, query);
  }

  @Get('posts')
  @RequirePermission('fanpage_stats.view')
  @ApiOperation({ summary: 'Số bài theo tuần Thứ Hai-CN + tổng mục tiêu bài/tuần của Page đang theo dõi' })
  posts(@Query() query: StatsRangeQueryDto, @GetUser() user: FanpageCaller) {
    return this.service.posts(user, query);
  }

  @Get('top-posts')
  @RequirePermission('fanpage_stats.view')
  @ApiOperation({ summary: 'Top bài theo like + comment + share (chỉ bài đã nhập số liệu)' })
  topPosts(@Query() query: TopPostsQueryDto, @GetUser() user: FanpageCaller) {
    return this.service.topPosts(user, query);
  }

  @Get('outcomes')
  @RequirePermission('fanpage_stats.view')
  @ApiOperation({ summary: 'Page → Khách & Tiền nạp (PLAN 3.7): Page chính ghi công, Page tham gia, Tổng DISTINCT, Chưa quy về Page. Tiền chỉ khi qua cổng 4 lớp' })
  outcomesReport(@Query() query: OutcomesQueryDto, @GetUser() user: FanpageCaller) {
    return this.outcomes.getOutcomes(user, query);
  }

  @Get('outcomes/customers')
  @RequirePermission('fanpage_stats.view')
  @ApiOperation({ summary: 'Danh sách khách của 1 Page (ghi công / tham gia) - đúng phạm vi customers.view của người xem' })
  outcomeCustomers(@Query() query: OutcomeCustomersQueryDto, @GetUser() user: FanpageCaller) {
    return this.outcomes.listCustomers(user, query);
  }
}

@ApiTags('Fanpage - Số liệu định kỳ')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('fanpages/:fanpageId')
export class FanpageSnapshotsController {
  constructor(
    private readonly metrics: FanpageMetricsService,
    private readonly stats: FanpageStatsService,
  ) {}

  @Get('snapshots')
  @RequirePermission('fanpages.view')
  @ApiOperation({ summary: 'Số liệu định kỳ của Page (mới nhất trước, tối đa 400 dòng)' })
  list(@Param('fanpageId', ParseIntPipe) fanpageId: number, @Query() query: SnapshotListQueryDto, @GetUser() user: FanpageCaller) {
    return this.metrics.list(fanpageId, user, query);
  }

  @Put('snapshots/:date')
  @RequirePermission('fanpage_metrics.manage')
  @ApiOperation({ summary: 'Nhập/sửa số liệu 1 ngày (upsert; trường bỏ trống giữ nguyên, null = xoá)' })
  upsert(
    @Param('fanpageId', ParseIntPipe) fanpageId: number,
    @Param('date') date: string,
    @Body() dto: UpsertSnapshotDto,
    @GetUser() user: FanpageCaller,
  ) {
    return this.metrics.upsert(fanpageId, date, dto, user);
  }

  @Delete('snapshots/:date')
  @RequirePermission('fanpage_metrics.delete')
  @ApiOperation({ summary: 'Xoá số liệu 1 ngày (mặc định chỉ Admin)' })
  removeSnapshot(@Param('fanpageId', ParseIntPipe) fanpageId: number, @Param('date') date: string, @GetUser() user: FanpageCaller) {
    return this.metrics.remove(fanpageId, date, user);
  }

  @Get('targets')
  @RequirePermission('fanpages.view')
  @ApiOperation({ summary: 'Mục tiêu follower tăng thêm theo tháng kèm số đã tăng thực tế (chỉ để báo cáo)' })
  targets(@Param('fanpageId', ParseIntPipe) fanpageId: number, @GetUser() user: FanpageCaller) {
    return this.metrics.listTargets(fanpageId, user);
  }

  @Put('targets/:month')
  @RequirePermission('fanpage_metrics.manage')
  @ApiOperation({ summary: 'Đặt/đổi/bỏ (null) mục tiêu follower của 1 tháng (YYYY-MM)' })
  setTarget(
    @Param('fanpageId', ParseIntPipe) fanpageId: number,
    @Param('month') month: string,
    @Body() dto: SetTargetDto,
    @GetUser() user: FanpageCaller,
  ) {
    return this.metrics.setTarget(fanpageId, month, dto, user);
  }

  @Get('heatmap')
  @RequirePermission('fanpages.view')
  @ApiOperation({ summary: 'Lưới số bài theo ngày (mặc định 12 tuần) để vẽ heatmap' })
  heatmap(@Param('fanpageId', ParseIntPipe) fanpageId: number, @Query() query: HeatmapQueryDto, @GetUser() user: FanpageCaller) {
    return this.stats.heatmap(fanpageId, query.weeks, user);
  }
}

@ApiTags('Fanpage - Lưới nhập số liệu')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('fanpage-metrics')
export class FanpageMetricsController {
  constructor(private readonly service: FanpageMetricsService) {}

  @Get('grid')
  @RequirePermission('fanpage_metrics.manage')
  @ApiOperation({ summary: 'Lưới nhập nhanh: Page đang theo dõi người gọi được nhập, kèm số đã nhập hôm đó + lần trước' })
  grid(@Query() query: GridQueryDto, @GetUser() user: FanpageCaller) {
    return this.service.grid(user, query.date);
  }

  @Put('bulk')
  @RequirePermission('fanpage_metrics.manage')
  @ApiOperation({ summary: 'Lưu nhiều dòng số liệu cùng ngày; lỗi trả theo TỪNG dòng, dòng hợp lệ vẫn lưu' })
  bulk(@Body() dto: BulkSnapshotDto, @GetUser() user: FanpageCaller) {
    return this.service.bulk(dto, user);
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

@ApiTags('Fanpage - Data khách hàng (Lead)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
// ⚠️ Phải đăng ký SAU FanpagesController trong module: `fanpages/outcomes/customers` (route tĩnh) cũng khớp pattern `:fanpageId/customers`.
@Controller('fanpages/:fanpageId/customers')
export class FanpageLeadsController {
  constructor(private readonly service: FanpageLeadsService) {}

  @Get()
  @RequirePermission('customers.view')
  @ApiOperation({ summary: 'Khách (Lead) của Page - theo phạm vi customers.view của người xem, phân trang BE' })
  list(@Param('fanpageId', ParseIntPipe) fanpageId: number, @Query() query: FanpageLeadsQueryDto, @GetUser() user: FanpageCaller) {
    return this.service.list(fanpageId, query, user);
  }

  @Post()
  @RequirePermission('customers.create')
  @ApiOperation({ summary: 'Thêm khách (Lead) thủ công cho Page - đi qua CustomersService.create, SĐT bắt buộc' })
  create(@Param('fanpageId', ParseIntPipe) fanpageId: number, @Body() dto: FanpageLeadDto, @GetUser() user: FanpageCaller) {
    return this.service.create(fanpageId, dto, user);
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
