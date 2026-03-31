import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CustomersImportService } from './customers.import.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerFiltersDto } from './dto/customer-filters.dto';
import { ImportCustomerDto } from './dto/import-customer.dto';
import { BulkAssignDto } from './dto/bulk-assign.dto';
import { CreateCustomerNoteDto } from './dto/create-customer-note.dto';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

@ApiTags('Customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly customersImportService: CustomersImportService
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Lấy thống kê khách hàng (Option A - Theo quyền)' })
  async getStats(@Request() req: any) {
    console.log('[Customers] GetStats requested by user:', req.user.id);
    return this.customersService.getStats(req.user.id, req.user.role);
  }

  @Post('import')
  @Roles(Role.ADMIN, Role.MANAGER, Role.ASSISTANT)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Import dữ liệu khách hàng từ file Excel' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ImportCustomerDto })
  async importExcel(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    return this.customersImportService.importExcel(file, req.user.id);
  }

  @Patch('bulk-assign')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Bàn giao Khách hàng hàng loạt cho Sales' })
  async bulkAssign(@Body() dto: BulkAssignDto, @Request() req: any) {
    return this.customersService.bulkAssign(dto, req.user.id, req.user.role);
  }

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
  @ApiResponse({ status: 200, description: 'Chi tiết khách hàng (kèm Sales, Department, Deposits, Notes)' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy khách hàng hoặc không có quyền xem' })
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.customersService.findOne(+id, req.user.id, req.user.role);
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Thêm ghi chú khách hàng' })
  async createNote(@Param('id') id: string, @Body() dto: CreateCustomerNoteDto, @Request() req: any) {
    return this.customersService.createNote(+id, dto, req.user.id);
  }

  @Post(':id/deposits')
  @Roles(Role.ADMIN, Role.MANAGER, Role.ASSISTANT)
  @ApiOperation({ summary: 'Thêm nạp tiền cho khách hàng' })
  async createDeposit(@Param('id') id: string, @Body() dto: CreateDepositDto, @Request() req: any) {
    return this.customersService.createDeposit(+id, dto, req.user.id);
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
