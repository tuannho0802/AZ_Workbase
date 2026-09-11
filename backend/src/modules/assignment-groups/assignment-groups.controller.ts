import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AssignmentGroupsService } from './assignment-groups.service';
import { CreateAssignmentGroupDto } from './dto/create-assignment-group.dto';
import { UpdateAssignmentGroupDto } from './dto/update-assignment-group.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('Assignment Groups (Quản lý phụ trách)')
@Controller('assignment-groups')
export class AssignmentGroupsController {
  constructor(private readonly service: AssignmentGroupsService) {}

  // ⚠️ Khai báo TRƯỚC route `:id` - tránh Nest match "GET /assignment-groups/sales/users"
  // vào route `:id` (coi "sales" là id), đúng thứ tự đã áp dụng ở PositionsController.
  @Get(':key/users')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Danh sách user hợp lệ theo config (chỉ cần đăng nhập - data hỗ trợ hiển thị dropdown, không phải hành động nhạy cảm, giống triết lý /roles/my-permissions)',
  })
  resolveUsers(@Param('key') key: string) {
    return this.service.resolveUsers(key);
  }

  // ⚠️ CỐ Ý KHÔNG gắn @RequirePermission('assignment_groups.view') ở GET /
  // và GET /:id nữa (chỉ còn JwtAuthGuard) - permission này CHỈ dùng để FE
  // gate sidebar/trang "Quản lý phụ trách" (nav-config.tsx,
  // quan-ly-phu-trach/page.tsx). GET / còn được useAssignmentGroups() gọi
  // từ CustomerForm.tsx, customers/page.tsx, chia-data/page.tsx (đều là
  // trang mọi nhân viên dùng hàng ngày) để biết danh sách config
  // sales/marketing/content_staff hợp lệ trước khi tra
  // GET /assignment-groups/:key/users (route ngay trên, vốn đã CỐ TÌNH mở
  // cho mọi user đăng nhập) - dùng chung 1 permission cho cả 2 mục đích
  // khiến Admin tắt 'assignment_groups.view' để ẩn trang quản lý vô tình phá
  // các trang nghiệp vụ trên. Mirror đúng cách fix ở
  // leave-types.controller.ts.
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách tất cả config kèm departments/positions đã gán (mọi user đã đăng nhập)' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chi tiết 1 config (mọi user đã đăng nhập)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('assignment_groups.create')
  @ApiOperation({ summary: 'Tạo config mới (key tuỳ chỉnh, khác sales/marketing)' })
  create(@Body() dto: CreateAssignmentGroupDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('assignment_groups.update')
  @ApiOperation({ summary: 'Sửa tên/mô tả + ghi đè toàn bộ danh sách department/position' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAssignmentGroupDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('assignment_groups.delete')
  @ApiOperation({ summary: 'Xoá config (chặn nếu is_system=true)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}