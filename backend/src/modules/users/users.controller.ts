import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ApproveUserDto } from './dto/approve-user.dto';
import { RejectUserDto } from './dto/reject-user.dto';
import { CacheControlInterceptor } from '../../common/interceptors/cache-control.interceptor';

@ApiTags('Users')
@ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('all')
    // KHÔNG gắn @RequirePermission - endpoint này CỐ TÌNH mở cho MỌI role đã
    // đăng nhập (dùng để đổ dropdown chọn nhân viên ở khắp nơi trong app,
    // không phải màn quản trị nhân sự) - khớp hành vi cũ (@Roles liệt kê đủ cả
    // 4 role = tương đương không giới hạn gì).
  @UseInterceptors(new CacheControlInterceptor(60))
  @ApiOperation({ summary: 'Lấy toàn bộ danh sách nhân viên (Không phân trang)' })
  async findAllList(
    @Request() req: any,
    @Query('role') role?: string,
  ) {
    return this.usersService.findEmployees(req.user.id, req.user.role, role, true);
  }

  @Get()
  @RequirePermission('users.manage')
  @UseInterceptors(new CacheControlInterceptor(60))
  @ApiOperation({ summary: 'Danh sách nhân viên (Phân trang & Filter)' })
  async findAll(
    @Request() req: any,
    @Query('role') role?: string,
    @Query('departmentId') departmentId?: number,
    @Query('isActive') isActive?: boolean,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    // ⚠️ Trước đây limit không qua validation nào (raw query param), client
    // có thể gọi ?limit=999999 để kéo toàn bộ bảng users. Clamp về tối đa
    // 100 mà không đổi hành vi với các giá trị limit hợp lệ (<=100).
    const safeLimit = limit ? Math.min(Math.max(+limit, 1), 100) : 20;

    return this.usersService.findAll(req.user.id, req.user.role, {
      role,
      departmentId,
      isActive,
      search,
      page: page ? +page : 1,
      limit: safeLimit,
    });
  }

  @Get('me')
  @ApiOperation({ summary: 'Lấy thông tin cá nhân của người đang đăng nhập' })
  async getProfile(@Request() req: any) {
    return this.usersService.findById(req.user.id);
  }

  @Get('pending-approvals')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Danh sách tài khoản tự đăng ký đang chờ duyệt (Admin/Assistant toàn bộ, Manager chỉ phòng ban mình quản lý)' })
  async getPendingApprovals(@Request() req: any) {
    return this.usersService.findPendingApprovals(req.user.id, req.user.role);
  }

  @Get(':id')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết nhân viên theo ID' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.usersService.findOne(+id, req.user.id, req.user.role);
  }

  @Patch(':id/approve')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Duyệt tài khoản tự đăng ký (Admin/Assistant toàn bộ, Manager chỉ đúng phòng ban mình quản lý)' })
  async approveUser(@Param('id') id: string, @Body() dto: ApproveUserDto, @Request() req: any) {
    return this.usersService.approveUser(+id, req.user.id, req.user.role, dto);
  }

  @Patch(':id/reject')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Từ chối tài khoản tự đăng ký (Admin/Assistant toàn bộ, Manager chỉ đúng phòng ban mình quản lý)' })
  async rejectUser(@Param('id') id: string, @Body() dto: RejectUserDto, @Request() req: any) {
    return this.usersService.rejectUser(+id, req.user.id, req.user.role, dto.reason);
  }

  @Post()
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Tạo nhân viên mới (Admin/Assistant toàn quyền, Manager chỉ trong phòng ban mình quản lý)' })
  async create(@Request() req: any, @Body() dto: CreateUserDto) {
    return this.usersService.create(dto, req.user.id, req.user.role);
  }

  @Patch(':id')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Cập nhật thông tin nhân viên' })
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Request() req: any) {
    return this.usersService.update(+id, dto, req.user.id, req.user.role);
  }

  // ⚠️ Endpoint GET/PUT `:id/profile` (Fanpage/Group thủ công) ĐÃ BỊ XOÁ -
  // xem user.entity.ts. Trang Profile giờ dùng
  // `GET /link-groups/managed-by-me` (LinkGroupManagersController) để lấy
  // danh sách nhóm user đang là Quản lý chính/phụ - tự động, không cần
  // nhập tay, không cần endpoint riêng ở đây nữa.

  @Patch(':id/reset-password')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Đặt lại mật khẩu nhân viên (Admin/Assistant toàn bộ, Manager trong phòng ban quản lý)' })
  async resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto, @Request() req: any) {
    return this.usersService.resetPassword(+id, dto, req.user.id, req.user.role);
  }
}