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

  // ⚠️ CỐ Ý KHÔNG gắn @RequirePermission('departments.view') ở GET / và
  // GET /:id nữa (chỉ còn JwtAuthGuard) - permission này CHỈ dùng để FE gate
  // sidebar/trang "Phòng ban" (nav-config.tsx, phong-ban/page.tsx). Trước
  // đây dùng chung 1 permission cho cả 2 mục đích -> Admin tắt
  // 'departments.view' để ẩn trang quản lý vô tình chặn luôn dropdown
  // "Phòng ban" ở CustomerForm.tsx (mọi nhân viên tạo/sửa khách hàng đều
  // gọi useDepartments() -> GET /departments) và ở chia-data/page.tsx (bộ
  // lọc phòng ban khi chia data) - 403 dù người dùng không hề đụng tới
  // trang "Phòng ban". Mirror đúng cách fix ở leave-types.controller.ts /
  // customer-statuses.controller.ts.
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(new CacheControlInterceptor(300, true))
  @ApiOperation({ summary: 'Danh sách tất cả phòng ban (mọi user đã đăng nhập, không cần permission riêng)' })
  findAll() {
    return this.departmentsService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy chi tiết phòng ban (mọi user đã đăng nhập, không cần permission riêng)' })
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