import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerFiltersDto } from './dto/customer-filters.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

@ApiTags('Customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo khách hàng mới' })
  @ApiResponse({ status: 201, description: 'Khách hàng tạo thành công' })
  @ApiResponse({ status: 400, description: 'Lỗi validation hoặc trùng số điện thoại' })
  create(@Request() req: any, @Body() createCustomerDto: CreateCustomerDto) {
    return this.customersService.create(createCustomerDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách khách hàng (có phân quyền)' })
  @ApiResponse({ status: 200, description: 'Trả về danh sách khách hàng và thông tin phân trang' })
  findAll(@Request() req: any, @Query() filtersDto: CustomerFiltersDto) {
    return this.customersService.findAll(filtersDto, req.user.id, req.user.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết khách hàng' })
  @ApiResponse({ status: 200, description: 'Chi tiết khách hàng (kèm Sales, Department, Deposits)' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy khách hàng hoặc không có quyền xem' })
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.customersService.findOne(+id, req.user.id, req.user.role);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật thông tin khách hàng' })
  @ApiResponse({ status: 200, description: 'Cập nhật khách hàng thành công' })
  update(@Request() req: any, @Param('id') id: string, @Body() updateCustomerDto: UpdateCustomerDto) {
    return this.customersService.update(+id, updateCustomerDto, req.user.id, req.user.role);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Xóa mềm khách hàng (Chỉ dành cho Admin và Manager)' })
  @ApiResponse({ status: 200, description: 'Đã xóa mềm khách hàng thành công' })
  @ApiResponse({ status: 403, description: 'Chỉ Admin hoặc Manager mới có quyền xóa khách hàng' })
  remove(@Request() req: any, @Param('id') id: string) {
    return this.customersService.remove(+id, req.user.id, req.user.role);
  }
}
