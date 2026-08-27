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
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Tạo category mới (chỉ admin)' })
  async create(@Body() dto: CreateLinkCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Sửa tên/màu/thứ tự category (chỉ admin)' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLinkCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Patch(':id/lock')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Khoá category (chỉ admin)' })
  async lock(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.setLocked(id, true);
  }

  @Patch(':id/unlock')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Mở khoá category (chỉ admin)' })
  async unlock(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.setLocked(id, false);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Xoá category - chỉ được nếu chưa có group nào (chỉ admin)' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.remove(id);
  }
}
