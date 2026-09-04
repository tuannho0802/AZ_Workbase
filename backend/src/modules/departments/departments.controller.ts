import { Controller, Get, Post, Patch, Param, Body, UseGuards, ParseIntPipe, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
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
  // Không cần @RequirePermission - mở cho mọi role đã đăng nhập (dùng làm
  // danh mục tham chiếu ở nhiều nơi, không phải màn quản trị) - khớp hành vi
  // cũ (JwtAuthGuard+RolesGuard nhưng không có @Roles nào = không giới hạn).
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(new CacheControlInterceptor(300))
  @ApiOperation({ summary: 'Lấy danh sách phòng ban đang hoạt động' })
  findAll() {
    return this.departmentsService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
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
}