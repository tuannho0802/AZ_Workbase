import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { LinkGroupManagersService } from './link-group-managers.service';
import { AddGroupManagerDto } from './dto/add-group-manager.dto';

/**
 * "Quản lý chính/phụ" của từng LinkGroup - KHÁC với LinkGroupsController
 * (CRUD group nói chung, admin-only). Controller này phục vụ đúng yêu cầu:
 * user thường CHỈ xem/thao tác được trên group mà họ được gán (chính hoặc
 * phụ) - không phải admin-only, cũng không mở toang cho mọi user như
 * `GET /link-groups` (endpoint đó vẫn giữ nguyên, phục vụ checklist "tham
 * gia nhóm" khi tạo/sửa khách hàng - KHÔNG đụng vào).
 */
@ApiTags('Link Group Managers (Quản lý chính/phụ theo từng nhóm)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('link-groups')
export class LinkGroupManagersController {
  constructor(private readonly managersService: LinkGroupManagersService) {}

  @Get('managed-by-me')
  @ApiOperation({
    summary:
      'Danh sách nhóm mà user hiện tại được xem trong tính năng "Quản lý nhóm liên kết" - admin thấy TẤT CẢ, user thường CHỈ thấy nhóm mình là Quản lý chính hoặc phụ',
  })
  async listManagedByMe(@GetUser() user: any) {
    return this.managersService.listManagedByMe(user.id, user.role);
  }

  @Get(':id/managers')
  @ApiOperation({
    summary: 'Xem Quản lý chính + phụ của 1 nhóm - chỉ admin/chính/phụ của nhóm đó mới xem được',
  })
  async getManagers(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    return this.managersService.getManagers(id, user.id, user.role);
  }

  @Post(':id/managers')
  @ApiOperation({
    summary: 'Thêm 1 Quản lý phụ cho nhóm - chỉ admin hoặc chính Quản lý chính của nhóm đó',
  })
  async addManager(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddGroupManagerDto,
    @GetUser() user: any,
  ) {
    return this.managersService.addSecondaryManager(id, dto.userId, user.id, user.role);
  }

  @Delete(':id/managers/:userId')
  @ApiOperation({
    summary: 'Gỡ 1 Quản lý phụ khỏi nhóm - chỉ admin hoặc chính Quản lý chính của nhóm đó',
  })
  async removeManager(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @GetUser() user: any,
  ) {
    return this.managersService.removeSecondaryManager(id, userId, user.id, user.role);
  }
}
