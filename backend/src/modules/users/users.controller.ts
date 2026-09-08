import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GetPermissionScope } from '../../common/decorators/get-permission-scope.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ApproveUserDto } from './dto/approve-user.dto';
import { RejectUserDto } from './dto/reject-user.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { UpdateOwnEmailDto } from './dto/update-own-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
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
  @UseInterceptors(new CacheControlInterceptor(60, true))
  @ApiOperation({ summary: 'Lấy toàn bộ danh sách nhân viên (Không phân trang)' })
  async findAllList(
    @Request() req: any,
    @Query('role') role?: string,
  ) {
    return this.usersService.findEmployees(req.user.id, req.user.role, role, true);
  }

  @Get()
  @RequirePermission('users.view')
  // ⚠️ FIX BUG THẬT (đúng nguyên nhân "update User xong phải đợi ~2 phút mới
  // đúng data"): trước đây dùng CacheControlInterceptor(60) - chế độ mù
  // (revalidate=false) sinh header "public, max-age=60,
  // stale-while-revalidate=120" -> trình duyệt có thể trả data CŨ tối đa
  // 60+120=180 giây mà KHÔNG hề hỏi lại server, dù PATCH /users/:id đã
  // chạy thành công (API call success nhưng UI vẫn thấy data cũ vì đọc
  // thẳng từ cache trình duyệt, chưa từng gửi request mới). Đổi sang
  // revalidate=true ("private, no-cache" + ETag) - trình duyệt LUÔN phải
  // hỏi lại server trước khi dùng bản cache, server tính lại ETag từ data
  // MỚI NHẤT mỗi lần - không thể trả nhầm data cũ nữa, vẫn giữ được lợi
  // ích 304 Not Modified khi data thực sự chưa đổi.
  @UseInterceptors(new CacheControlInterceptor(60, true))
  @ApiOperation({ summary: 'Danh sách nhân viên (Phân trang & Filter)' })
  async findAll(
    @Request() req: any,
    @GetPermissionScope() scope?: string | null,
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

    return this.usersService.findAll(req.user.id, req.user.role, scope, {
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
  async getPendingApprovals(@Request() req: any, @GetPermissionScope() scope?: string | null) {
    return this.usersService.findPendingApprovals(req.user.id, req.user.role, scope);
  }

  // ⚠️ THỨ TỰ QUAN TRỌNG: `Get('trash')` PHẢI đứng TRƯỚC `Get(':id')` bên
  // dưới - NestJS/Express khớp route theo đúng thứ tự khai báo, không tự ưu
  // tiên route "tĩnh" (literal) hơn route "động" (`:id`). Nếu đặt sau,
  // `GET /users/trash` sẽ bị `Get(':id')` nuốt mất (hiểu nhầm id="trash").
  @Get('trash')
  @RequirePermission('users.delete')
  @ApiOperation({ summary: 'Danh sách tài khoản đã xoá mềm (thùng rác)' })
  async getTrash() {
    return this.usersService.listTrash();
  }

  @Get(':id')
  @RequirePermission('users.view')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết nhân viên theo ID' })
  async findOne(@Param('id') id: string, @Request() req: any, @GetPermissionScope() scope?: string | null) {
    return this.usersService.findOne(+id, req.user.id, req.user.role, scope);
  }

  @Patch(':id/approve')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Duyệt tài khoản tự đăng ký (Admin/Assistant toàn bộ, Manager chỉ đúng phòng ban mình quản lý)' })
  async approveUser(@Param('id') id: string, @Body() dto: ApproveUserDto, @Request() req: any, @GetPermissionScope() scope?: string | null) {
    return this.usersService.approveUser(+id, req.user.id, req.user.role, scope, dto);
  }

  @Patch(':id/reject')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Từ chối tài khoản tự đăng ký (Admin/Assistant toàn bộ, Manager chỉ đúng phòng ban mình quản lý)' })
  async rejectUser(@Param('id') id: string, @Body() dto: RejectUserDto, @Request() req: any, @GetPermissionScope() scope?: string | null) {
    return this.usersService.rejectUser(+id, req.user.id, req.user.role, scope, dto.reason);
  }

  @Post()
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Tạo nhân viên mới (Admin/Assistant toàn quyền, Manager chỉ trong phòng ban mình quản lý)' })
  async create(@Request() req: any, @Body() dto: CreateUserDto, @GetPermissionScope() scope?: string | null) {
    return this.usersService.create(dto, req.user.id, req.user.role, scope);
  }

  @Patch(':id')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Cập nhật thông tin nhân viên' })
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Request() req: any, @GetPermissionScope() scope?: string | null) {
    return this.usersService.update(+id, dto, req.user.id, req.user.role, scope);
  }

  // ⚠️ Endpoint GET/PUT `:id/profile` (Fanpage/Group thủ công) ĐÃ BỊ XOÁ -
  // xem user.entity.ts. Trang Profile giờ dùng
  // `GET /link-groups/managed-by-me` (LinkGroupManagersController) để lấy
  // danh sách nhóm user đang là Quản lý chính/phụ - tự động, không cần
  // nhập tay, không cần endpoint riêng ở đây nữa.

  @Patch(':id/reset-password')
  @RequirePermission('users.manage')
  @ApiOperation({ summary: 'Đặt lại mật khẩu nhân viên (Admin/Assistant toàn bộ, Manager trong phòng ban quản lý)' })
  async resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto, @Request() req: any, @GetPermissionScope() scope?: string | null) {
    return this.usersService.resetPassword(+id, dto, req.user.id, req.user.role, scope);
  }

  // ==========================================================================
  // PROFILE TỰ PHỤC VỤ - CHÍNH MÌNH SỬA HỒ SƠ CỦA MÌNH (id luôn lấy từ JWT,
  // KHÔNG nhận :id tuỳ ý trên URL - tránh 1 user gọi API sửa hồ sơ NGƯỜI
  // KHÁC qua nhầm endpoint "của chính mình"). Đặt SAU route `:id/*` phía
  // trên để tránh NestJS match nhầm "me" vào param `:id`.
  // ==========================================================================

  @Patch('me/profile')
  @RequirePermission('profile.edit_info')
  @ApiOperation({ summary: 'Tự sửa thông tin cá nhân (tên, SĐT) - không gồm Email' })
  async updateOwnProfile(@Request() req: any, @Body() dto: UpdateOwnProfileDto) {
    return this.usersService.updateOwnProfile(req.user.id, dto);
  }

  @Patch('me/email')
  @RequirePermission('profile.edit_email')
  @ApiOperation({ summary: 'Tự đổi Email đăng nhập (mặc định chỉ Admin, cần nhập lại mật khẩu hiện tại)' })
  async updateOwnEmail(@Request() req: any, @Body() dto: UpdateOwnEmailDto) {
    return this.usersService.updateOwnEmail(req.user.id, dto);
  }

  @Patch('me/password')
  @RequirePermission('profile.change_password')
  @ApiOperation({ summary: 'Tự đổi mật khẩu (cần nhập đúng mật khẩu hiện tại)' })
  async changeOwnPassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    return this.usersService.changeOwnPassword(req.user.id, dto);
  }

  // ==========================================================================
  // XOÁ TÀI KHOẢN (mềm -> cứng) - `users.delete`, mặc định CHỈ Admin, tuỳ
  // biến được qua trang "/phan-quyen" (xem UsersService.hardDeleteUser JSDoc
  // để biết cơ chế fallback gán lại dữ liệu liên quan).
  // ==========================================================================

  @Patch(':id/soft-delete')
  @RequirePermission('users.delete')
  @ApiOperation({ summary: 'Xoá mềm tài khoản (chuyển vào thùng rác - dữ liệu vẫn giữ nguyên)' })
  async softDelete(@Param('id') id: string, @Request() req: any) {
    return this.usersService.softDeleteUser(+id, req.user.id);
  }

  @Patch('trash/:id/restore')
  @RequirePermission('users.delete')
  @ApiOperation({ summary: 'Khôi phục tài khoản khỏi thùng rác' })
  async restore(@Param('id') id: string, @Request() req: any) {
    return this.usersService.restoreUser(+id, req.user.id);
  }

  @Delete('trash/:id/hard-delete')
  @RequirePermission('users.delete')
  @ApiOperation({ summary: 'Xoá vĩnh viễn (bắt buộc đã xoá mềm trước) - auto fallback gán data liên quan cho người xoá' })
  async hardDelete(@Param('id') id: string, @Request() req: any) {
    return this.usersService.hardDeleteUser(+id, req.user.id);
  }
}