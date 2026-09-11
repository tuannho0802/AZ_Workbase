import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { LeaveTypesService } from './leave-types.service';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('Leave Types (Loại đơn nghỉ phép)')
@ApiBearerAuth()
// Gộp guard ở class-level - controller này không có route public nào, mirror
// đúng CustomerStatusesController (tránh quên PermissionGuard khi thêm
// endpoint mới).
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('leave-types')
export class LeaveTypesController {
  constructor(private readonly leaveTypesService: LeaveTypesService) {}

  // ⚠️ CỐ Ý KHÔNG gắn @RequirePermission() ở đây (chỉ còn JwtAuthGuard qua
  // class-level @UseGuards) - permission 'leave_types.view' CHỈ dùng để FE
  // gate sidebar/trang "Quản lý Loại phép" (xem nav-config.tsx +
  // quan-ly-loai-phep/page.tsx), KHÔNG được dùng để chặn API này, vì mọi
  // nhân viên đã đăng nhập (bất kể có quyền vào trang quản lý hay không) vẫn
  // PHẢI gọi được để load dropdown "Loại phép" khi tạo đơn nghỉ phép
  // (nghi-phep/page.tsx). Trước đây dùng chung 1 permission cho cả 2 mục
  // đích -> Admin tắt 'leave_types.view' để ẩn trang quản lý vô tình chặn
  // luôn nhân viên tạo đơn nghỉ phép (403 'Bạn không có quyền thực hiện
  // hành động này') - đã fix bằng cách tách 2 mục đích này ra.
  @Get()
  @ApiOperation({ summary: 'Danh sách tất cả loại đơn nghỉ phép (mọi user đã đăng nhập, không cần permission riêng)' })
  findAll() {
    return this.leaveTypesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết 1 loại phép (mọi user đã đăng nhập, không cần permission riêng)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.leaveTypesService.findOne(id);
  }

  @Post()
  @RequirePermission('leave_types.manage')
  @ApiOperation({ summary: 'Tạo loại phép mới (Admin, Assistant)' })
  create(@Body() dto: CreateLeaveTypeDto) {
    return this.leaveTypesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('leave_types.manage')
  @ApiOperation({ summary: 'Sửa tên/mô tả/màu/hưởng lương/thứ tự loại phép (không đổi được code)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLeaveTypeDto) {
    return this.leaveTypesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('leave_types.delete')
  @ApiOperation({
    summary:
      'Xoá loại phép (chỉ Admin) - chặn nếu là loại phép hệ thống. Nếu đang có đơn nghỉ phép dùng, ' +
      'bắt buộc truyền fallbackCode để chuyển dữ liệu các đơn đó sang loại phép khác trước khi xoá.',
  })
  @ApiQuery({
    name: 'fallbackCode',
    required: false,
    description: 'Mã loại phép thay thế - bắt buộc nếu loại phép đang xoá còn đơn nghỉ phép dùng',
  })
  remove(@Param('id', ParseIntPipe) id: number, @Query('fallbackCode') fallbackCode?: string) {
    return this.leaveTypesService.remove(id, fallbackCode);
  }
}