import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CustomerStatusesService } from './customer-statuses.service';
import { CreateCustomerStatusDto } from './dto/create-customer-status.dto';
import { UpdateCustomerStatusDto } from './dto/update-customer-status.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('Customer Statuses (Trạng thái khách hàng)')
@ApiBearerAuth()
// Gộp guard ở class-level - controller này không có route public nào,
// mirror đúng fix đã áp dụng ở MediaSourcesController (tránh quên
// PermissionGuard khi thêm endpoint mới).
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('customer-statuses')
export class CustomerStatusesController {
  constructor(private readonly customerStatusesService: CustomerStatusesService) {}

  // Không giới hạn role cao - MỌI nhân viên đã đăng nhập cần gọi được để
  // load dropdown "Trạng thái" khi thêm/sửa khách hàng.
  @Get()
  @RequirePermission('customer_statuses.view')
  @ApiOperation({ summary: 'Danh sách tất cả trạng thái khách hàng' })
  findAll() {
    return this.customerStatusesService.findAll();
  }

  @Get(':id')
  @RequirePermission('customer_statuses.view')
  @ApiOperation({ summary: 'Lấy chi tiết 1 trạng thái' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.customerStatusesService.findOne(id);
  }

  @Post()
  @RequirePermission('customer_statuses.manage')
  @ApiOperation({ summary: 'Tạo trạng thái khách hàng mới (Admin, Assistant)' })
  create(@Body() dto: CreateCustomerStatusDto) {
    return this.customerStatusesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('customer_statuses.manage')
  @ApiOperation({ summary: 'Sửa tên/mô tả/màu/thứ tự trạng thái (không đổi được code)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCustomerStatusDto) {
    return this.customerStatusesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('customer_statuses.delete')
  @ApiOperation({ summary: 'Xoá trạng thái - chặn nếu là trạng thái hệ thống hoặc đang có khách hàng dùng (chỉ Admin)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.customerStatusesService.remove(id);
  }
}
