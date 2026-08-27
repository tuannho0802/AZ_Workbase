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
import { LinkGroupsService } from './link-groups.service';
import { CreateLinkGroupDto } from './dto/create-link-group.dto';
import { UpdateLinkGroupDto } from './dto/update-link-group.dto';

@ApiTags('Link Groups (Zalo/FB/Threads groups)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('link-groups')
export class LinkGroupsController {
  constructor(private readonly groupsService: LinkGroupsService) {}

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
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Tạo nhóm mới (chỉ admin)' })
  async create(@Body() dto: CreateLinkGroupDto) {
    return this.groupsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Sửa tên/url/thứ tự nhóm (chỉ admin)' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLinkGroupDto) {
    return this.groupsService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ẩn nhóm khỏi checklist (chỉ admin)' })
  async deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.groupsService.setActive(id, false);
  }

  @Patch(':id/activate')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Hiện lại nhóm (chỉ admin)' })
  async activate(@Param('id', ParseIntPipe) id: number) {
    return this.groupsService.setActive(id, true);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Xoá nhóm - chỉ được nếu chưa có customer nào có dữ liệu join (chỉ admin)' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.groupsService.remove(id);
  }
}
