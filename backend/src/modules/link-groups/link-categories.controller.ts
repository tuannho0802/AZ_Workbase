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
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { LinkCategoriesService } from './link-categories.service';
import { CreateLinkCategoryDto } from './dto/create-link-category.dto';
import { UpdateLinkCategoryDto } from './dto/update-link-category.dto';

@ApiTags('Link Categories (Zalo/FB/Threads groups)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('link-categories')
export class LinkCategoriesController {
  constructor(private readonly categoriesService: LinkCategoriesService) {}

  // Không giới hạn role - mọi nhân viên đã đăng nhập cần gọi được để load
  // dropdown khi tạo Group / xem checklist join-nhóm của khách hàng. Quyền
  // CRUD/khoá-mở mới giới hạn admin (các endpoint bên dưới).
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách category. activeOnly=true để chỉ lấy category đang mở.' })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  async findAll(@Query('activeOnly') activeOnly?: string) {
    return this.categoriesService.findAll(activeOnly === 'true');
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.ASSISTANT)
  @ApiOperation({ summary: 'Tạo category mới (Admin, Assistant)' })
  async create(@Body() dto: CreateLinkCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.ASSISTANT)
  @ApiOperation({ summary: 'Sửa tên/màu/thứ tự category (Admin, Assistant)' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLinkCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Patch(':id/lock')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.ASSISTANT)
  @ApiOperation({ summary: 'Khoá category (Admin, Assistant)' })
  async lock(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.setLocked(id, true);
  }

  @Patch(':id/unlock')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.ASSISTANT)
  @ApiOperation({ summary: 'Mở khoá category (Admin, Assistant)' })
  async unlock(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.setLocked(id, false);
  }

  // FIX PERMISSIONS.md mục 1 (quy tắc Xoá) + mục 2.4: Xoá luôn tách riêng,
  // CHỈ Admin, không có ngoại lệ cho Assistant - khác với các hành động
  // sửa/khoá-mở ở trên. Module này CHƯA có khái niệm phòng ban gắn với
  // Category/Group (doc mục 2.4 ghi "cần bàn thêm hướng thiết kế nếu muốn
  // áp dụng") nên KHÔNG mở thêm cho Manager ở đây - chỉ mở phần chắc chắn
  // đúng rule (Assistant = Admin trừ Xoá), để tránh tự quyết thay chủ dự án
  // 1 quyết định thiết kế còn treo.
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Xoá category - chỉ được nếu chưa có group nào (chỉ Admin)' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.remove(id);
  }
}