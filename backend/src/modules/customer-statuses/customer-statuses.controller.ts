import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
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

  // ⚠️ CỐ Ý KHÔNG gắn @RequirePermission() ở đây (chỉ còn JwtAuthGuard qua
  // class-level @UseGuards) - permission 'customer_statuses.view' CHỈ dùng
  // để FE gate sidebar/trang "Quản lý Status khách" (xem nav-config.tsx +
  // quan-ly-status-khach/page.tsx), KHÔNG được dùng để chặn API này, vì mọi
  // nhân viên đã đăng nhập vẫn PHẢI gọi được để load dropdown "Trạng thái"
  // khi thêm/sửa khách hàng. Trước đây dùng chung 1 permission cho cả 2 mục
  // đích -> Admin tắt 'customer_statuses.view' để ẩn trang quản lý vô tình
  // chặn luôn nhân viên xem/tạo khách hàng - đã fix bằng cách tách 2 mục
  // đích này ra (mirror đúng cách fix ở leave-types.controller.ts).
  @Get()
  @ApiOperation({ summary: 'Danh sách tất cả trạng thái khách hàng (mọi user đã đăng nhập, không cần permission riêng)' })
  findAll() {
    return this.customerStatusesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết 1 trạng thái (mọi user đã đăng nhập, không cần permission riêng)' })
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
  @ApiOperation({
    summary:
      'Xoá trạng thái (chỉ Admin) - chặn nếu là trạng thái hệ thống. Nếu đang có khách hàng dùng, ' +
      'bắt buộc truyền fallbackCode để chuyển dữ liệu các khách hàng đó sang trạng thái khác trước khi xoá.',
  })
  @ApiQuery({
    name: 'fallbackCode',
    required: false,
    description: 'Mã trạng thái thay thế - bắt buộc nếu trạng thái đang xoá còn khách hàng dùng',
  })
  remove(@Param('id', ParseIntPipe) id: number, @Query('fallbackCode') fallbackCode?: string) {
    return this.customerStatusesService.remove(id, fallbackCode);
  }
}