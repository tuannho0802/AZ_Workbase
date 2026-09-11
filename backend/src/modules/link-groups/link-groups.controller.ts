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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { LinkGroupsService } from './link-groups.service';
import { CreateLinkGroupDto } from './dto/create-link-group.dto';
import { UpdateLinkGroupDto } from './dto/update-link-group.dto';

@ApiTags('Link Groups (Zalo/FB/Threads groups)')
@ApiBearerAuth()
// FIX rủi ro rà soát toàn hệ thống: gộp PermissionGuard lên class-level -
// trước đây lặp lại RIÊNG Ở TỪNG METHOD (5 chỗ), dễ quên khi thêm endpoint
// mới (xem giải thích đầy đủ ở media-sources.controller.ts). Controller
// này không có route public nào - an toàn để áp dụng chung.
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('link-groups')
export class LinkGroupsController {
  constructor(private readonly groupsService: LinkGroupsService) {}

  // ⚠️ CỐ Ý KHÔNG gắn @RequirePermission ở đây (chỉ còn JwtAuthGuard qua
  // class-level @UseGuards) - 'link_groups.view' CHỈ dùng để FE gate
  // sidebar/trang "Quản lý nhóm liên kết" (nav-config.tsx). GET này còn
  // được CustomerForm.tsx gọi (useAllActiveLinkGroups()) để load dropdown
  // khi MỌI nhân viên thêm khách hàng - mirror đúng cách fix ở
  // leave-types.controller.ts / media-sources.controller.ts.
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách nhóm, lọc theo categoryId/activeOnly (mọi role đã đăng nhập)' })
  @ApiQuery({ name: 'categoryId', required: false, type: Number })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  async findAll(
    @Query('categoryId') categoryId?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.groupsService.findAll(
      categoryId ? parseInt(categoryId, 10) : undefined,
      activeOnly === 'true',
    );
  }

  @Post()
  @RequirePermission('link_groups.manage')
  @ApiOperation({ summary: 'Tạo nhóm mới (Admin, Assistant)' })
  async create(@Body() dto: CreateLinkGroupDto) {
    return this.groupsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('link_groups.manage')
  @ApiOperation({ summary: 'Sửa tên/url/thứ tự nhóm (Admin, Assistant)' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLinkGroupDto) {
    return this.groupsService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @RequirePermission('link_groups.manage')
  @ApiOperation({ summary: 'Ẩn nhóm khỏi checklist (Admin, Assistant)' })
  async deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.groupsService.setActive(id, false);
  }

  @Patch(':id/activate')
  @RequirePermission('link_groups.manage')
  @ApiOperation({ summary: 'Hiện lại nhóm (Admin, Assistant)' })
  async activate(@Param('id', ParseIntPipe) id: number) {
    return this.groupsService.setActive(id, true);
  }

  // FIX PERMISSIONS.md mục 1 (quy tắc Xoá) + mục 2.4: tách riêng Xoá, CHỈ
  // Admin - xem giải thích tương tự ở link-categories.controller.ts (chưa
  // có khái niệm phòng ban cho Group nên không mở thêm cho Manager ở đây).
  @Delete(':id')
  @RequirePermission('link_groups.delete')
  @ApiOperation({ summary: 'Xoá nhóm - chỉ được nếu chưa có customer nào có dữ liệu join (chỉ Admin)' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.groupsService.remove(id);
  }
}