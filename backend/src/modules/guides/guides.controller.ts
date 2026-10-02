import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { GuidesService, GUIDES_MANAGE_PERMISSION } from './guides.service';
import { CreateGuideDto } from './dto/create-guide.dto';
import { UpdateGuideDto } from './dto/update-guide.dto';

/**
 * Hướng dẫn sử dụng động (PLAN_HARDENING P7).
 *
 * ⚠️ `GET /guides` và `GET /guides/:slug` CỐ Ý KHÔNG có @RequirePermission: mọi role đăng nhập đều xem được
 * guide đã xuất bản và đúng role của mình (lọc ở service, sai -> 404). Nhóm quản trị dùng `guides.manage`.
 * Route tĩnh `manage/*` khai TRƯỚC `:slug` (Nest khớp theo thứ tự).
 */
@ApiTags('Guides (Hướng dẫn sử dụng)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('guides')
export class GuidesController {
  constructor(private readonly guidesService: GuidesService) {}

  @Get()
  @ApiOperation({ summary: 'Mục lục guide đã xuất bản + đúng role của mình - mọi role đã đăng nhập' })
  list(@GetUser() user: any) {
    return this.guidesService.listVisible(user);
  }

  @Get('manage/all')
  @RequirePermission(GUIDES_MANAGE_PERMISSION)
  @ApiOperation({ summary: 'Danh sách quản trị (gồm bản nháp, kèm role) - guides.manage' })
  listManage() {
    return this.guidesService.listManage();
  }

  // ⚠️ PHẢI khai TRƯỚC `manage/:id`: nếu không "roles" bị coi là :id -> ParseIntPipe trả 400.
  @Get('manage/roles')
  @RequirePermission(GUIDES_MANAGE_PERMISSION)
  @ApiOperation({ summary: 'Danh sách role để chọn "role được xem" trong trình soạn - guides.manage' })
  listRoleOptions() {
    return this.guidesService.listRoleOptions();
  }

  @Get('manage/positions')
  @RequirePermission(GUIDES_MANAGE_PERMISSION)
  @ApiOperation({ summary: 'Danh sách vị trí (kèm màu) để chọn "vị trí được xem" - guides.manage' })
  listPositionOptions() {
    return this.guidesService.listPositionOptions();
  }

  @Get('manage/departments')
  @RequirePermission(GUIDES_MANAGE_PERMISSION)
  @ApiOperation({ summary: 'Danh sách phòng ban (kèm màu) để chọn "phòng ban được xem" - guides.manage' })
  listDepartmentOptions() {
    return this.guidesService.listDepartmentOptions();
  }

  @Get('manage/permissions')
  @RequirePermission(GUIDES_MANAGE_PERMISSION)
  @ApiOperation({ summary: 'Danh sách permission để chọn "cần quyền để xem" - guides.manage' })
  listPermissionOptions() {
    return this.guidesService.listPermissionOptions();
  }

  @Get('manage/:id')
  @RequirePermission(GUIDES_MANAGE_PERMISSION)
  @ApiOperation({ summary: 'Chi tiết 1 guide theo id (kể cả nháp) cho trình soạn - guides.manage' })
  getManageDetail(@Param('id', ParseIntPipe) id: number) {
    return this.guidesService.getManageDetail(id);
  }

  @Post()
  @RequirePermission(GUIDES_MANAGE_PERMISSION)
  @ApiOperation({ summary: 'Tạo guide - guides.manage' })
  create(@Body() dto: CreateGuideDto, @GetUser() user: any) {
    return this.guidesService.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission(GUIDES_MANAGE_PERMISSION)
  @ApiOperation({ summary: 'Sửa guide / xuất bản / đổi role được xem / thứ tự - guides.manage' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateGuideDto, @GetUser() user: any) {
    return this.guidesService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission(GUIDES_MANAGE_PERMISSION)
  @ApiOperation({ summary: 'Xoá mềm guide (audit lưu nguyên văn trước khi xoá) - guides.manage' })
  remove(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    return this.guidesService.remove(id, user);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Nội dung 1 guide theo slug - chỉ khi đã xuất bản + đúng role, ngược lại 404' })
  getBySlug(@Param('slug') slug: string, @GetUser() user: any) {
    return this.guidesService.getBySlug(slug, user);
  }
}
