import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, ParseIntPipe, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { DeleteDepartmentDto } from './dto/delete-department.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { CacheControlInterceptor } from '../../common/interceptors/cache-control.interceptor';

@ApiTags('Departments')
  @Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get('public')
  @ApiOperation({
    summary:
      'Danh sách phòng ban (công khai, KHÔNG cần đăng nhập) - chỉ id/name, dùng cho form đăng ký tài khoản',
  })
  findAllPublic() {
    return this.departmentsService.findAllPublic();
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('departments.view')
  // ⚠️ Cùng loại bug đã fix ở users.controller.ts (max-age=300 chế độ mù ->
  // trễ tới 300+120=420 giây thấy đúng data). Giờ phòng ban được sửa thường
  // xuyên hơn qua trang /phong-ban mới (gán Manager, đổi tên...) - đổi sang
  // revalidate=true (ETag) để không lặp lại đúng bug đó ở trang mới.
  @UseInterceptors(new CacheControlInterceptor(300, true))
  @ApiOperation({ summary: 'Danh sách tất cả phòng ban' })
  findAll() {
    return this.departmentsService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiBearerAuth()
  // ⚠️ FIX BUG THẬT (rà soát toàn hệ thống): trước đây route này chỉ có
  // JwtAuthGuard, thiếu hẳn @RequirePermission('departments.view') - nếu 1
  // role bị Admin thu hồi quyền này, họ vẫn xem được TỪNG phòng ban bằng
  // cách dò ID (1,2,3...) dù không xem được danh sách qua GET / nữa -
  // không nhất quán với chính rule mà route GET / đang áp dụng.
  @RequirePermission('departments.view')
  @ApiOperation({ summary: 'Lấy chi tiết phòng ban' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.departmentsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('departments.manage')
  @ApiOperation({ summary: 'Tạo phòng ban mới (Admin, Assistant)' })
  create(@Body() dto: CreateDepartmentDto) {
    return this.departmentsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('departments.manage')
  @ApiOperation({ summary: 'Cập nhật phòng ban, bao gồm gán Manager quản lý (Admin, Assistant)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDepartmentDto) {
    return this.departmentsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('departments.delete')
  @ApiOperation({
    summary:
      'Xoá phòng ban (CHỈ ADMIN) - bắt buộc còn tối thiểu 1 phòng ban sau khi xoá; ' +
      'nếu còn nhân viên thuộc phòng ban này phải truyền moveUsersToDepartmentId để di dời trước',
  })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DeleteDepartmentDto,
    @GetUser() user: any,
  ) {
    return this.departmentsService.remove(id, dto, user.id);
  }
}