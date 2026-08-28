import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import 'multer';
import { CustomersService } from './customers.service';
import { CustomersImportService } from './customers.import.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerFiltersDto } from './dto/customer-filters.dto';
import { ImportCustomerDto } from './dto/import-customer.dto';
import { BulkAssignDto } from './dto/bulk-assign.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { CreateCustomerNoteDto } from './dto/create-customer-note.dto';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { CacheControlInterceptor } from '../../common/interceptors/cache-control.interceptor';

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
  async getStats(@GetUser() user: any) {
    return this.customersService.getStats(user.id, user.role);
  }

  @Get('stats/today')
  @ApiOperation({ summary: 'Lấy danh sách khách hàng mới hôm nay' })
  async getStatsToday(@GetUser() user: any) {
    return this.customersService.getStatsToday(user.id, user.role);
  }

  @Get('stats/by-status')
  @ApiOperation({ summary: 'Lấy danh sách khách hàng theo trạng thái chốt' })
  async getStatsByStatus(@GetUser() user: any) {
    return this.customersService.getStatsByStatus(user.id, user.role);
  }

  @Get('stats/deposits')
  @ApiOperation({ summary: 'Lấy danh sách nạp tiền cho Dashboard (hỗ trợ lọc theo ngày)' })
  async getAllDepositsStats(
    @GetUser() user: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    return this.customersService.getAllDepositsStats(user.id, user.role, startDate, endDate, sortBy, sortOrder);
  }

  @Get('reports/invalid-data')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Report: khách hàng có data không hợp lệ (Ngày nhập sai, thiếu SĐT, thiếu Email, v.v.) - CHỈ ADMIN',
  })
  async getInvalidDataReport(
    @GetUser() user: any,
    @Query('invalidType') invalidType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.customersService.getInvalidDataReport(
      user.id,
      user.role,
      invalidType,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Post('import')
  @Roles(Role.ADMIN, Role.MANAGER, Role.ASSISTANT)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Import dữ liệu khách hàng từ file Excel' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ImportCustomerDto })
  async importExcel(@UploadedFile() file: Express.Multer.File, @GetUser('id') userId: number) {
    return this.customersImportService.importExcel(file, userId);
  }

  @Patch('bulk-assign')
  @Roles(Role.ADMIN, Role.MANAGER, Role.ASSISTANT, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Bàn giao Khách hàng hàng loạt cho Sales' })
  async bulkAssign(@Body() dto: BulkAssignDto, @GetUser() user: any) {
    return this.customersService.bulkAssign(
      dto.customerIds,
      dto.salesUserIds,
      user.id,
      user.role,
      dto.reason
    );
  }

  @Get('unassigned')
  @Roles(Role.ADMIN, Role.MANAGER, Role.ASSISTANT, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Lấy danh sách khách hàng chưa assign (salesUserId IS NULL)' })
  getUnassigned(@GetUser() user: any, @Query() filters: CustomerFiltersDto) {
    return this.customersService.getUnassigned(filters, user.id, user.role);
  }

  @Get('assigned')
  @Roles(Role.ADMIN, Role.MANAGER, Role.ASSISTANT, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Lấy danh sách khách hàng đã gán cho Sales (có phân quyền theo role)' })
  async getAssigned(
    @GetUser() user: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('salesUserId') salesUserId?: string,
    @Query('sourceUserId') sourceUserId?: string,
    @Query('search') search?: string,
  ) {
    return this.customersService.getAssigned({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      salesUserId: salesUserId ? parseInt(salesUserId, 10) : null,
      sourceUserId: sourceUserId ? parseInt(sourceUserId, 10) : null,
      search,
      userId: user.id,
      userRole: user.role,
    });
  }

  @Patch('assignments/:id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.ASSISTANT, Role.EMPLOYEE)
  @ApiOperation({
    summary: 'Sửa 1 lượt gán data (đổi người nhận hoặc lý do) - quyền kiểm tra chi tiết trong service',
  })
  async updateAssignment(
    @Param('id') id: string,
    @Body() dto: UpdateAssignmentDto,
    @GetUser() user: any,
  ) {
    return this.customersService.updateAssignment(+id, dto, user.id, user.role);
  }

  @Patch('assignments/:id/reclaim')
  @Roles(Role.ADMIN, Role.MANAGER, Role.ASSISTANT, Role.EMPLOYEE)
  @ApiOperation({
    summary: 'Thu hồi 1 lượt gán data - quyền kiểm tra chi tiết trong service',
  })
  async reclaimAssignment(@Param('id') id: string, @GetUser() user: any) {
    return this.customersService.reclaimAssignment(+id, user.id, user.role);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo khách hàng mới' })
  @ApiResponse({ status: 201, description: 'Khách hàng tạo thành công' })
  @ApiResponse({ status: 400, description: 'Lỗi validation hoặc trùng số điện thoại' })
  create(@GetUser('id') userId: number, @Body() createCustomerDto: CreateCustomerDto) {
    return this.customersService.create(createCustomerDto, userId);
  }

  @Get()
  @UseInterceptors(new CacheControlInterceptor(0, true))
  @ApiOperation({ summary: 'Lấy danh sách khách hàng (có phân quyền)' })
  @ApiResponse({ status: 200, description: 'Trả về danh sách khách hàng và thông tin phân trang' })
  findAll(@GetUser() user: any, @Query() filters: CustomerFiltersDto) {
    return this.customersService.findAll(filters, user.id, user.role);
  }

  @Get('trash')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách khách hàng đã xóa mềm' })
  getTrash(@Query() filters: CustomerFiltersDto) {
    return this.customersService.getTrash(filters);
  }

  @Patch('trash/:id/restore')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Khôi phục khách hàng từ trash' })
  restore(@Param('id') id: string, @GetUser() user: any) {
    return this.customersService.restore(+id, user.id);
  }

  @Delete('trash/:id/hard-delete')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Xóa vĩnh viễn khách hàng (Hard Delete)' })
  hardDelete(@Param('id') id: string, @GetUser() user: any) {
    return this.customersService.hardDelete(+id, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết khách hàng' })
  @ApiResponse({ status: 200, description: 'Chi tiết khách hàng (kèm Sales, Department, Deposits, Notes)' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy khách hàng hoặc không có quyền xem' })
  findOne(@GetUser() user: any, @Param('id') id: string) {
    return this.customersService.findOne(+id, user.id, user.role);
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Thêm ghi chú khách hàng' })
  async createNote(@Param('id') id: string, @Body() dto: CreateCustomerNoteDto, @GetUser() user: any) {
    return this.customersService.createNote(+id, dto, user.id, user.role);
  }

  @Post(':id/deposits')
  @ApiOperation({ summary: 'Thêm nạp tiền cho khách hàng - phạm vi kiểm tra trong service (giống findOne)' })
  async createDeposit(@Param('id') id: string, @Body() dto: CreateDepositDto, @GetUser() user: any) {
    return this.customersService.createDeposit(+id, dto, user.id, user.role);
  }

  @Get(':id/deposits')
  @ApiOperation({ summary: 'Lấy danh sách nạp tiền (5 bản ghi gần nhất)' })
  async getDeposits(@Param('id') id: string, @GetUser() user: any) {
    return this.customersService.getDeposits(+id, user.id, user.role);
  }

  @Get(':id/assignment-history')
  @ApiOperation({ summary: 'Lịch sử gán data của 1 khách hàng' })
  async getAssignmentHistory(@Param('id') id: string, @GetUser() user: any) {
    return this.customersService.getAssignmentHistory(+id, user.id, user.role);
  }

  @Delete('deposits/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Xóa bản ghi nạp tiền - CHỈ ADMIN (đúng rule Xoá ở PERMISSIONS.md mục 1, không có ngoại lệ cho Manager)' })
  async deleteDeposit(@Param('id') id: string, @GetUser() user: any) {
    return this.customersService.deleteDeposit(+id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật thông tin khách hàng' })
  @ApiResponse({ status: 200, description: 'Cập nhật khách hàng thành công' })
  update(@GetUser() user: any, @Param('id') id: string, @Body() updateCustomerDto: UpdateCustomerDto) {
    return this.customersService.update(+id, updateCustomerDto, user.id, user.role);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Xóa mềm khách hàng - CHỈ ADMIN (Assistant/Manager/Employee không có quyền xoá)' })
  @ApiResponse({ status: 200, description: 'Đã xóa mềm khách hàng thành công' })
  @ApiResponse({ status: 403, description: 'Chỉ Admin mới có quyền xóa khách hàng' })
  remove(@GetUser() user: any, @Param('id') id: string) {
    return this.customersService.remove(+id, user.id, user.role);
  }
}