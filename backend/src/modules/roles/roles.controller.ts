import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('Roles & Permissions (Phân quyền tuỳ chỉnh)')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('roles')
  @RequirePermission('roles.view')
  @ApiOperation({ summary: 'Danh sách Role kèm ma trận quyền đầy đủ' })
  findAllRoles() {
    return this.rolesService.findAllRoles();
  }

  @Get('permissions')
  @RequirePermission('roles.view')
  @ApiOperation({ summary: 'Danh mục permission hệ thống (để UI vẽ ma trận)' })
  findAllPermissions() {
    return this.rolesService.findAllPermissions();
  }

  @Post('roles')
  @RequirePermission('roles.manage')
  @ApiOperation({ summary: 'Tạo Role mới (tuỳ chỉnh, ngoài 4 role hệ thống)' })
  createRole(@Body() dto: CreateRoleDto) {
    return this.rolesService.createRole(dto);
  }

  @Patch('roles/:id')
  @RequirePermission('roles.manage')
  @ApiOperation({ summary: 'Sửa tên/mô tả Role (không đổi được code)' })
  updateRole(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.rolesService.updateRole(id, dto);
  }

  @Delete('roles/:id')
  @RequirePermission('roles.manage')
  @ApiOperation({ summary: 'Xoá Role tuỳ chỉnh (không xoá được role hệ thống hoặc role đang có người dùng)' })
  deleteRole(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.deleteRole(id);
  }

  @Patch('roles/:id/permissions')
  @RequirePermission('roles.manage')
  @ApiOperation({ summary: 'Ghi đè TOÀN BỘ ma trận quyền của 1 Role' })
  updateRolePermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.rolesService.updateRolePermissions(id, dto);
  }
}
