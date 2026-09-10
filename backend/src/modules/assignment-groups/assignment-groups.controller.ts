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

  @Get()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('assignment_groups.manage')
  @ApiOperation({ summary: 'Danh sách tất cả config kèm departments/positions đã gán' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('assignment_groups.manage')
  @ApiOperation({ summary: 'Chi tiết 1 config' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('assignment_groups.manage')
  @ApiOperation({ summary: 'Tạo config mới (key tuỳ chỉnh, khác sales/marketing)' })
  create(@Body() dto: CreateAssignmentGroupDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('assignment_groups.manage')
  @ApiOperation({ summary: 'Sửa tên/mô tả + ghi đè toàn bộ danh sách department/position' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAssignmentGroupDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('assignment_groups.manage')
  @ApiOperation({ summary: 'Xoá config (chặn nếu is_system=true)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
