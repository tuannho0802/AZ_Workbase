import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PeriodicTasksService } from './periodic-tasks.service';
import { PeriodicTaskLinksService } from './periodic-task-links.service';
import { PeriodicTaskCustomersService } from './periodic-task-customers.service';
import { PeriodicTaskSecondaryAssigneesService } from './periodic-task-secondary-assignees.service';
import { PeriodicTaskChecklistItemsService } from './periodic-task-checklist-items.service';
import { CreatePeriodicTaskDto } from './dto/create-periodic-task.dto';
import { UpdatePeriodicTaskDto } from './dto/update-periodic-task.dto';
import { PeriodicTaskFiltersDto } from './dto/periodic-task-filters.dto';
import { CreatePeriodicTaskLinkDto } from './dto/create-periodic-task-link.dto';
import { LinkPeriodicTaskCustomersDto } from './dto/link-periodic-task-customers.dto';
import { AddPeriodicTaskSecondaryAssigneeDto } from './dto/add-periodic-task-secondary-assignee.dto';
import { LockPeriodicTaskDto } from './dto/lock-periodic-task.dto';
import { CreatePeriodicTaskChecklistItemDto } from './dto/create-periodic-task-checklist-item.dto';
import { UpdatePeriodicTaskChecklistItemDto } from './dto/update-periodic-task-checklist-item.dto';
import { ReorderPeriodicTaskChecklistItemsDto } from './dto/reorder-periodic-task-checklist-items.dto';
import { GetPeriodicTaskAuditLogsDto } from './dto/get-periodic-task-audit-logs.dto';
import { PeriodicTaskAuditService } from './periodic-task-audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { GetPermissionScope } from '../../common/decorators/get-permission-scope.decorator';

/**
 * PeriodicTasksController - Phase 1 + 2 + 3 + 4 + 5 + 6 (PLAN mục 5 + mục 6).
 */
@ApiTags('Periodic Tasks (Công việc định kỳ)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('periodic-tasks')
export class PeriodicTasksController {
  constructor(
    private readonly periodicTasksService: PeriodicTasksService,
    private readonly periodicTaskLinksService: PeriodicTaskLinksService,
    private readonly periodicTaskCustomersService: PeriodicTaskCustomersService,
    private readonly periodicTaskSecondaryAssigneesService: PeriodicTaskSecondaryAssigneesService,
    private readonly periodicTaskChecklistItemsService: PeriodicTaskChecklistItemsService,
    private readonly periodicTaskAuditService: PeriodicTaskAuditService,
  ) { }

  @Post()
  @RequirePermission('periodic_tasks.create')
  @ApiOperation({ summary: 'Tạo Công việc định kỳ mới (thủ công, không có recurrence)' })
  @ApiResponse({ status: 201, description: 'Tạo thành công' })
  create(@Body() dto: CreatePeriodicTaskDto, @GetUser('id') userId: number) {
    return this.periodicTasksService.create(dto, userId);
  }

  @Get()
  @RequirePermission('periodic_tasks.view')
  @ApiOperation({ summary: 'Danh sách Công việc định kỳ (có phân quyền + lọc theo kỳ hạn/khoảng thời gian)' })
  findAll(
    @GetUser() user: any,
    @Query() filters: PeriodicTaskFiltersDto,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.periodicTasksService.findAll(filters, user.id, user.role, scope);
  }

  @Get(':id')
  @RequirePermission('periodic_tasks.view')
  @ApiOperation({ summary: 'Chi tiết 1 Công việc định kỳ (kèm linkedCustomers nếu có quyền customers.view)' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hoặc không có quyền xem' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    const task = await this.periodicTasksService.findOne(id, user.id, user.role, scope);
    // Phase 3 (PLAN mục 2.4 bước 3+4): xoá hẳn key `linkedCustomers` nếu
    // người xem không có `customers.view` - xem JSDoc `attachLinkedCustomers()`.
    const withCustomers = await this.periodicTaskCustomersService.attachLinkedCustomers(task, user);
    // Phase 4: đính thêm `secondaryAssignees` - không cần ẩn theo quyền
    // (xem JSDoc `attachSecondaryAssignees()`).
    const withSecondary = await this.periodicTaskSecondaryAssigneesService.attachSecondaryAssignees(withCustomers);
    // Phase 6: đính thêm `checklistItems` - cũng không cần ẩn theo quyền
    // (xem JSDoc `attachChecklistItems()`).
    return this.periodicTaskChecklistItemsService.attachChecklistItems(withSecondary);
  }

  @Patch(':id')
  @RequirePermission('periodic_tasks.edit')
  @ApiOperation({ summary: 'Sửa Công việc định kỳ (đổi tiêu đề/kỳ hạn/trạng thái/người phụ trách chính/phòng ban)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePeriodicTaskDto,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.periodicTasksService.update(id, dto, user, scope);
  }

  @Delete(':id')
  @RequirePermission('periodic_tasks.delete')
  @ApiOperation({ summary: 'Xoá mềm Công việc định kỳ - CHỈ Admin' })
  remove(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    return this.periodicTasksService.remove(id, user.id, user.role);
  }

  // ── Phase 2: Liên kết phân cấp DAG (multi-parent, skip-level) + Rollup % ──

  @Post(':id/links')
  @RequirePermission('periodic_tasks.edit')
  @ApiOperation({ summary: 'Gán 1 Công việc cha cho Công việc này (:id = con, body.parentTaskId = cha)' })
  @ApiResponse({ status: 400, description: 'Sai chiều rank / trùng cạnh / tạo thành vòng lặp' })
  addLink(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePeriodicTaskLinkDto,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.periodicTaskLinksService.addLink(id, dto, user, scope);
  }

  @Delete(':id/links/:parentTaskId')
  @RequirePermission('periodic_tasks.edit')
  @ApiOperation({ summary: 'Gỡ liên kết cha khỏi Công việc này' })
  removeLink(
    @Param('id', ParseIntPipe) id: number,
    @Param('parentTaskId', ParseIntPipe) parentTaskId: number,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.periodicTaskLinksService.removeLink(id, parentTaskId, user, scope);
  }

  @Get(':id/children')
  @RequirePermission('periodic_tasks.view')
  @ApiOperation({ summary: 'Danh sách Công việc con TRỰC TIẾP' })
  getChildren(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.periodicTaskLinksService.getChildren(id, user.id, user.role, scope);
  }

  @Get(':id/parents')
  @RequirePermission('periodic_tasks.view')
  @ApiOperation({ summary: 'Danh sách Công việc cha TRỰC TIẾP (multi-parent)' })
  getParents(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.periodicTaskLinksService.getParents(id, user.id, user.role, scope);
  }

  @Get(':id/rollup')
  @RequirePermission('periodic_tasks.view')
  @ApiOperation({ summary: '% hoàn thành (tính LIVE theo con trực tiếp, không đệ quy cộng dồn)' })
  getRollup(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.periodicTaskLinksService.getRollup(id, user.id, user.role, scope);
  }

  // ── Phase 3: Gắn Customer vào Task (kèm ẩn field theo quyền) ──

  @Post(':id/customers')
  @RequirePermission('periodic_tasks.edit')
  @ApiOperation({ summary: 'Gắn danh sách Khách hàng vào Công việc (cần thêm periodic_tasks.link_customer)' })
  @ApiResponse({ status: 403, description: 'Thiếu periodic_tasks.link_customer hoặc customers.view' })
  @ApiResponse({ status: 400, description: 'Customer không tồn tại hoặc ngoài phạm vi quyền xem' })
  addCustomers(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LinkPeriodicTaskCustomersDto,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.periodicTaskCustomersService.addCustomers(id, dto, user, scope);
  }

  @Delete(':id/customers/:customerId')
  @RequirePermission('periodic_tasks.edit')
  @ApiOperation({ summary: 'Gỡ 1 Khách hàng khỏi Công việc (cần thêm periodic_tasks.link_customer)' })
  removeCustomer(
    @Param('id', ParseIntPipe) id: number,
    @Param('customerId', ParseIntPipe) customerId: number,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.periodicTaskCustomersService.removeCustomer(id, customerId, user, scope);
  }

  // ── Phase 4: Phụ trách chính/phụ ("1 chính + N phụ") ──

  @Post(':id/secondary-assignees')
  @RequirePermission('periodic_tasks.edit')
  @ApiOperation({ summary: 'Thêm 1 Phụ trách phụ cho Công việc' })
  @ApiResponse({ status: 400, description: 'Người này đang là Phụ trách chính, hoặc không tồn tại/đã bị khoá' })
  @ApiResponse({ status: 409, description: 'Người này đã là Phụ trách phụ rồi' })
  addSecondaryAssignee(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddPeriodicTaskSecondaryAssigneeDto,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.periodicTaskSecondaryAssigneesService.addSecondaryAssignee(id, dto, user, scope);
  }

  @Delete(':id/secondary-assignees/:userId')
  @RequirePermission('periodic_tasks.edit')
  @ApiOperation({ summary: 'Gỡ 1 Phụ trách phụ khỏi Công việc' })
  removeSecondaryAssignee(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.periodicTaskSecondaryAssigneesService.removeSecondaryAssignee(id, userId, user, scope);
  }

  // ── Phase 5: Khoá/mở khoá (approve) - PLAN mục 2.9 + mục 5 ──

  @Patch(':id/lock')
  @RequirePermission('periodic_tasks.approve')
  @ApiOperation({ summary: 'Khoá Công việc định kỳ - idempotent, gọi lại nhiều lần không lỗi (2 chiều tự do)' })
  @ApiResponse({ status: 403, description: 'Thiếu periodic_tasks.approve trong phạm vi scope của Task' })
  lock(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LockPeriodicTaskDto,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.periodicTasksService.lock(id, dto, user, scope);
  }

  @Patch(':id/unlock')
  @RequirePermission('periodic_tasks.approve')
  @ApiOperation({ summary: 'Mở khoá Công việc định kỳ - tự do gọi lại bất kỳ lúc nào, không giới hạn số lần' })
  unlock(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.periodicTasksService.unlock(id, user, scope);
  }

  // ── Phase 6: Checklist con kiểu Trello (không có permission riêng - thừa
  // hưởng periodic_tasks.view/edit của chính Task cha, xem PLAN mục 6) ──

  @Get(':id/checklist-items')
  @RequirePermission('periodic_tasks.view')
  @ApiOperation({ summary: 'Danh sách checklist item của Công việc, sắp xếp theo position' })
  getChecklistItems(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.periodicTaskChecklistItemsService.findAllForTask(id, user.id, user.role, scope);
  }

  @Post(':id/checklist-items')
  @RequirePermission('periodic_tasks.edit')
  @ApiOperation({ summary: 'Thêm 1 checklist item mới vào cuối danh sách' })
  addChecklistItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePeriodicTaskChecklistItemDto,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.periodicTaskChecklistItemsService.create(id, dto, user, scope);
  }

  // ⚠️ Route tĩnh `reorder` PHẢI khai TRƯỚC route `:itemId` bên dưới - Nest/
  // Express khớp route theo THỨ TỰ ĐĂNG KÝ (không theo độ cụ thể), khai sau
  // sẽ khiến "reorder" bị `:itemId` (+ ParseIntPipe) nuốt mất, trả 400 sai.
  @Patch(':id/checklist-items/reorder')
  @RequirePermission('periodic_tasks.edit')
  @ApiOperation({ summary: 'Sắp xếp lại thứ tự TOÀN BỘ checklist item (kéo-thả kiểu Trello)' })
  @ApiResponse({ status: 400, description: 'itemIds không phải hoán vị đầy đủ của checklist hiện có' })
  reorderChecklistItems(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReorderPeriodicTaskChecklistItemsDto,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.periodicTaskChecklistItemsService.reorder(id, dto, user, scope);
  }

  @Patch(':id/checklist-items/:itemId')
  @RequirePermission('periodic_tasks.edit')
  @ApiOperation({ summary: 'Sửa nội dung và/hoặc đánh dấu xong/chưa xong 1 checklist item' })
  updateChecklistItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdatePeriodicTaskChecklistItemDto,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.periodicTaskChecklistItemsService.update(id, itemId, dto, user, scope);
  }

  @Delete(':id/checklist-items/:itemId')
  @RequirePermission('periodic_tasks.edit')
  @ApiOperation({ summary: 'Xoá 1 checklist item' })
  removeChecklistItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.periodicTaskChecklistItemsService.remove(id, itemId, user, scope);
  }

  // ── Phase 7 (cuối): Audit log riêng - PLAN mục 2.6 + mục 5 ──

  @Get(':id/audit-logs')
  @RequirePermission('periodic_tasks.view')
  @ApiOperation({ summary: 'Lịch sử audit của 1 Công việc định kỳ (mới nhất trước, có phân trang)' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hoặc không có quyền xem' })
  async getAuditLogs(
    @Param('id', ParseIntPipe) id: number,
    @Query() filters: GetPeriodicTaskAuditLogsDto,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    // "1 cổng gác" - Task ngoài phạm vi periodic_tasks.view của người gọi
    // tự 404 trước khi kịp truy vấn bảng audit (đúng JSDoc
    // `PeriodicTaskAuditService.getLogsForTask()`).
    await this.periodicTasksService.findOne(id, user.id, user.role, scope);
    return this.periodicTaskAuditService.getLogsForTask(id, filters);
  }
}