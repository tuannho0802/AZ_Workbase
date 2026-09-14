import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PeriodicTasksService } from './periodic-tasks.service';
import { PeriodicTaskLinksService } from './periodic-task-links.service';
import { CreatePeriodicTaskDto } from './dto/create-periodic-task.dto';
import { UpdatePeriodicTaskDto } from './dto/update-periodic-task.dto';
import { PeriodicTaskFiltersDto } from './dto/periodic-task-filters.dto';
import { CreatePeriodicTaskLinkDto } from './dto/create-periodic-task-link.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { GetPermissionScope } from '../../common/decorators/get-permission-scope.decorator';

/**
 * PeriodicTasksController - Phase 1 + Phase 2 (PLAN mục 5 + mục 6). Endpoint
 * Customer (`/customers` - Phase 3), phụ trách phụ (`/secondary-assignees` -
 * Phase 4), lock/unlock (Phase 5) sẽ được thêm ở đúng Phase tương ứng.
 */
@ApiTags('Periodic Tasks (Công việc định kỳ)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('periodic-tasks')
export class PeriodicTasksController {
  constructor(
    private readonly periodicTasksService: PeriodicTasksService,
    private readonly periodicTaskLinksService: PeriodicTaskLinksService,
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
  @ApiOperation({ summary: 'Chi tiết 1 Công việc định kỳ' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy hoặc không có quyền xem' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.periodicTasksService.findOne(id, user.id, user.role, scope);
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
    return this.periodicTasksService.update(id, dto, user.id, user.role, scope);
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
    return this.periodicTaskLinksService.addLink(id, dto, user.id, user.role, scope);
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
    return this.periodicTaskLinksService.removeLink(id, parentTaskId, user.id, user.role, scope);
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
}