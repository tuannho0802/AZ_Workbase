import { Controller, Get, Patch, Param, ParseIntPipe, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { GetPermissionScope } from '../../common/decorators/get-permission-scope.decorator';
import { CustomerGroupMembershipsService } from './customer-group-memberships.service';

class SetMembershipDto {
  @ApiProperty({ example: true, description: 'true = đã join, false = chưa/rời nhóm' })
  @IsBoolean()
  joined: boolean;
}

import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('Customer Group Memberships (đã join nhóm nào)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('customers')
export class CustomerGroupMembershipsController {
  constructor(private readonly membershipsService: CustomerGroupMembershipsService) {}

  @Get(':id/group-memberships')
  @RequirePermission('customers.view')
  @ApiOperation({ summary: 'Checklist toàn bộ nhóm (theo category) + trạng thái đã join của customer này' })
  async getMemberships(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.membershipsService.getMembershipsForCustomer(id, user.id, user.role, scope);
  }

  @Patch(':id/group-memberships/:groupId')
  // ⚠️ FIX BUG THẬT: trước đây đòi `customers.manage` - permission KEY CŨ,
  // đã bị migration `1778900000000-SplitCustomersManagePermission` tách
  // thành `customers.create`/`customers.edit` cho TOÀN BỘ route
  // create/edit khách hàng khác, NHƯNG route này (module link-groups,
  // KHÔNG nằm trong phạm vi migration đó) bị bỏ sót, vẫn giữ nguyên
  // `customers.manage` - permission này CHỈ được seed sẵn cho
  // admin/assistant/manager (xem `1778600000000-AddDetailedRbacPermissions`),
  // KHÔNG BAO GIỜ tự động có ở Employee dù Employee đã được cấp
  // `customers.edit` (dùng để sửa thông tin KH bình thường). Hậu quả: bất
  // kỳ role nào (kể cả Employee) có quyền sửa khách hàng vẫn bị 403 khi
  // tick "đã join nhóm" - đúng bug đã gặp thật (customer 53217). Đổi sang
  // `customers.edit` để nhất quán với phần còn lại của "sửa thông tin
  // khách hàng" - ai sửa được KH thì cũng tick được nhóm của KH đó.
  @RequirePermission('customers.edit')
  @ApiOperation({ summary: 'Bật/tắt trạng thái đã join của customer với 1 group' })
  async setMembership(
    @Param('id', ParseIntPipe) id: number,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() dto: SetMembershipDto,
    @GetUser() user: any,
    @GetPermissionScope() scope: string | null | undefined,
  ) {
    return this.membershipsService.setMembership(id, groupId, dto.joined, user.id, user.role, scope);
  }
}