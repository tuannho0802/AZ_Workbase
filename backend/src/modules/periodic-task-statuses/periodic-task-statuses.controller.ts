import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, ParseIntPipe, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PeriodicTaskStatusesService } from './periodic-task-statuses.service';
import { CreatePeriodicTaskStatusDto } from './dto/create-periodic-task-status.dto';
import { UpdatePeriodicTaskStatusDto } from './dto/update-periodic-task-status.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('Periodic Task Statuses (Trạng thái công việc định kỳ)')
@ApiBearerAuth()
// Gộp guard ở class-level - controller này không có route public nào,
// mirror đúng CustomerStatusesController/LeaveTypesController.
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('periodic-task-statuses')
export class PeriodicTaskStatusesController {
  constructor(private readonly periodicTaskStatusesService: PeriodicTaskStatusesService) {}

  // ⚠️ CỐ Ý KHÔNG gắn @RequirePermission() ở đây (chỉ còn JwtAuthGuard qua
  // class-level @UseGuards) - permission 'periodic_task_statuses.view' CHỈ
  // dùng để FE gate trang quản lý, KHÔNG được dùng để chặn API này, vì mọi
  // nhân viên đã đăng nhập vẫn PHẢI gọi được để load dropdown "Trạng thái"
  // khi tạo/sửa Công việc định kỳ (mirror đúng cách fix ở
  // customer-statuses.controller.ts/leave-types.controller.ts).
  @Get()
  @ApiOperation({ summary: 'Danh sách tất cả trạng thái công việc định kỳ (mọi user đã đăng nhập, không cần permission riêng)' })
  findAll() {
    return this.periodicTaskStatusesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết 1 trạng thái (mọi user đã đăng nhập, không cần permission riêng)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.periodicTaskStatusesService.findOne(id);
  }

  @Post()
  @RequirePermission('periodic_task_statuses.manage')
  @ApiOperation({ summary: 'Tạo trạng thái công việc định kỳ mới (Admin, Assistant)' })
  create(@Body() dto: CreatePeriodicTaskStatusDto, @Request() req) {
    return this.periodicTaskStatusesService.create(dto, req.user.id);
  }

  @Patch(':id')
  @RequirePermission('periodic_task_statuses.manage')
  @ApiOperation({ summary: 'Sửa tên/mô tả/màu/thứ tự/isDoneState/isExcludedFromRollup (không đổi được code)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePeriodicTaskStatusDto, @Request() req) {
    return this.periodicTaskStatusesService.update(id, dto, req.user.id);
  }

  @Delete(':id')
  @RequirePermission('periodic_task_statuses.delete')
  @ApiOperation({
    summary:
      'Xoá trạng thái (chỉ Admin) - chặn nếu là trạng thái hệ thống. Nếu đang có Task dùng, ' +
      'bắt buộc truyền fallbackStatusId để chuyển dữ liệu các Task đó sang trạng thái khác trước khi xoá.',
  })
  @ApiQuery({
    name: 'fallbackStatusId',
    required: false,
    description: 'ID trạng thái thay thế - bắt buộc nếu trạng thái đang xoá còn Task dùng',
  })
  remove(@Param('id', ParseIntPipe) id: number, @Query('fallbackStatusId') fallbackStatusId: string | undefined, @Request() req) {
    return this.periodicTaskStatusesService.remove(id, fallbackStatusId ? +fallbackStatusId : undefined, req.user.id);
  }
}