import { Controller, Get, Put, Delete, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UiVisibilityService } from './ui-visibility.service';
import { UpdateUiVisibilityRulesDto } from './dto/update-ui-visibility-rules.dto';
import { UiVisibilityScopeQueryDto } from './dto/ui-visibility-scope-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';

/**
 * ⚠️ Trục "UI Visibility" (field/tab HIỆN hay ẨN) - HOÀN TOÀN TÁCH BIỆT với
 * `RolesController` (Action Permission). Đọc JSDoc `UiVisibilityService`
 * trước khi sửa. Quyền quản trị dùng LẠI `roles.manage` (không tạo permission
 * riêng - cùng nhóm "cấu hình phân quyền" với Role/Department/Position
 * override, xem PLAN mục 4.4).
 */
@ApiTags('UI Visibility (Ẩn/hiện field, tab theo Role/Phòng ban/Vị trí)')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UiVisibilityController {
  constructor(private readonly uiVisibilityService: UiVisibilityService) {}

  @Get('ui-visibility/my-hidden')
  @ApiOperation({
    summary:
      'Danh sách element_key đang bị ẩn của CHÍNH người gọi - không cần roles.manage, ai cũng xem được của bản thân. FE dùng route này để tự ẩn cột/tab, đồng bộ đúng những gì BE đã strip khỏi response.',
  })
  getMyHidden(@GetUser() user: any, @Query('resource') resource: string) {
    return this.uiVisibilityService.getMyHiddenElements(
      user.role,
      resource,
      user.departmentId,
      user.positionId,
      user.isRootAdmin,
    );
  }

  @Get('roles/:id/ui-visibility-rules')
  @RequirePermission('roles.manage')
  @ApiOperation({ summary: 'Toàn bộ rule ẩn/hiện (Global + mọi override Phòng ban/Vị trí) của 1 Role' })
  getRoleRules(@Param('id', ParseIntPipe) roleId: number, @Query('resource') resource: string) {
    return this.uiVisibilityService.getRoleRules(roleId, resource);
  }

  @Put('roles/:id/ui-visibility-rules')
  @RequirePermission('roles.manage')
  @ApiOperation({
    summary:
      'Ghi đè TOÀN BỘ rule ẩn/hiện ở ĐÚNG 1 scope (Global/1 Phòng ban/1 Vị trí - xác định bởi departmentId/positionId trong body, không được set cả hai)',
  })
  upsertRoleRules(@Param('id', ParseIntPipe) roleId: number, @Body() dto: UpdateUiVisibilityRulesDto) {
    return this.uiVisibilityService.upsertRoleRules(roleId, dto);
  }

  @Delete('roles/:id/ui-visibility-rules')
  @RequirePermission('roles.manage')
  @ApiOperation({ summary: 'Reset 1 scope (Global/1 Phòng ban/1 Vị trí) về mặc định (không ẩn gì)' })
  deleteRoleRules(@Param('id', ParseIntPipe) roleId: number, @Query() query: UiVisibilityScopeQueryDto) {
    return this.uiVisibilityService.deleteRoleRules(roleId, query);
  }
}