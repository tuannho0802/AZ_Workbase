import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { UtmsService } from './utms.service';
import { UtmManagersService } from './utm-managers.service';
import { CreateUtmDto } from './dto/create-utm.dto';
import { UpdateUtmDto } from './dto/update-utm.dto';
import { UtmUserIdDto } from './dto/utm-user-id.dto';
import { UtmQueryDto } from './dto/utm-query.dto';

/**
 * UTM (danh mục chiến dịch, thay cho `customers.campaign` nhập tay). Mirror link-groups.
 *
 * ⚠️ Các GET dùng cho dropdown/trang cá nhân (`GET /utms`, `managed-by-me`, `:id/managers`) CỐ Ý KHÔNG có
 * @RequirePermission: Employee không có `utms.view`/`utms.create` vẫn phải chọn UTM ở form khách hàng
 * và thấy tag UTM ở bảng mà không dính 403 (FE không được loop toast 403). Dữ liệu tự lọc ở service.
 * Route tĩnh khai TRƯỚC `:id` (Nest khớp theo thứ tự).
 */
@ApiTags('UTMs (danh mục UTM + Quản lý chính/phụ)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('utms')
export class UtmsController {
  constructor(
    private readonly utmsService: UtmsService,
    private readonly managersService: UtmManagersService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'UTM được phép dùng (dropdown) - mọi role đã đăng nhập' })
  findUsable(@Query() query: UtmQueryDto, @GetUser() user: any) {
    return this.utmsService.findUsable(user, query);
  }

  @Get('managed-by-me')
  @ApiOperation({ summary: 'UTM mà mình là Quản lý chính/phụ' })
  managedByMe(@GetUser() user: any) {
    return this.utmsService.listManagedByMe(user);
  }

  @Get('scoped')
  @RequirePermission('utms.view')
  @ApiOperation({ summary: 'Tab "Tất cả UTM" - lọc theo scope của utms.view' })
  listScoped(@GetUser() user: any) {
    return this.utmsService.listScoped(user);
  }

  @Post()
  @RequirePermission('utms.create')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Tạo UTM mới - người tạo là Quản lý chính' })
  create(@Body() dto: CreateUtmDto, @GetUser() user: any) {
    return this.utmsService.create(dto, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết 1 UTM kèm quyền của người gọi' })
  getOne(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    return this.utmsService.getOne(id, user);
  }

  @Patch(':id')
  @RequirePermission('utms.edit')
  @ApiOperation({ summary: 'Sửa UTM (tên/hiển thị: chính hoặc scope rộng; mô tả/màu: cả phụ)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUtmDto, @GetUser() user: any) {
    return this.utmsService.update(id, dto, user);
  }

  @Patch(':id/deactivate')
  @RequirePermission('utms.edit')
  @ApiOperation({ summary: 'Khoá UTM (không cho chọn mới)' })
  deactivate(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    return this.utmsService.setActive(id, false, user);
  }

  @Patch(':id/activate')
  @RequirePermission('utms.edit')
  @ApiOperation({ summary: 'Mở khoá UTM' })
  activate(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    return this.utmsService.setActive(id, true, user);
  }

  @Delete(':id')
  @RequirePermission('utms.delete')
  @ApiOperation({ summary: 'Xoá UTM - chỉ khi không còn khách hàng tham chiếu' })
  remove(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    return this.utmsService.remove(id, user);
  }

  // ---- Quản lý chính/phụ ----

  @Get(':id/managers')
  @ApiOperation({ summary: 'Xem Quản lý chính + phụ - thành viên của UTM hoặc scope utms.view phủ tới' })
  getManagers(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    return this.managersService.getManagers(id, user);
  }

  @Post(':id/managers')
  @RequirePermission('utms.assign')
  @ApiOperation({ summary: 'Thêm Quản lý phụ - Quản lý chính hoặc scope rộng' })
  addManager(@Param('id', ParseIntPipe) id: number, @Body() dto: UtmUserIdDto, @GetUser() user: any) {
    return this.managersService.addSecondaryManager(id, dto.userId, user);
  }

  @Delete(':id/managers/:userId')
  @RequirePermission('utms.assign')
  @ApiOperation({ summary: 'Gỡ Quản lý phụ - Quản lý chính hoặc scope rộng' })
  removeManager(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @GetUser() user: any,
  ) {
    return this.managersService.removeSecondaryManager(id, userId, user);
  }

  @Patch(':id/primary-manager')
  @RequirePermission('utms.assign')
  @ApiOperation({ summary: 'Chuyển Quản lý chính - Quản lý chính hiện tại hoặc scope rộng' })
  transferPrimary(@Param('id', ParseIntPipe) id: number, @Body() dto: UtmUserIdDto, @GetUser() user: any) {
    return this.managersService.transferPrimary(id, dto.userId, user);
  }
}
