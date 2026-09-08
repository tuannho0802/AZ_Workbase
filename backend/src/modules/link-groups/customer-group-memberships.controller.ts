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
    // ⚠️ `scope` ở đây là scope của `customers.view` (route này chỉ đòi
    // permission đó) - dùng để check quyền XEM checklist. Quyền TICK
    // (`canManage` trong response) được tính RIÊNG bên trong service theo
    // `customer_group_memberships.set`, không dùng lại biến `scope` này -
    // xem JSDoc `getMembershipsForCustomer()`.
    return this.membershipsService.getMembershipsForCustomer(id, user.id, user.role, scope, user.departmentId);
  }

  @Patch(':id/group-memberships/:groupId')
  // ⚠️ LỊCH SỬ (xem PERMISSIONS.md mục 3 để đọc đầy đủ):
  // - Bản gốc đòi `customers.manage` (permission LEGACY, chỉ seed sẵn cho
  //   admin/assistant/manager) -> Employee luôn bị 403 khi tick "đã join
  //   nhóm" dù sửa khách hàng bình thường không lỗi (bug thật, customer
  //   53217, 2026-09-08).
  // - Vá tạm bằng cách đổi sang `customers.edit` - hết 403 nhưng vẫn GỘP
  //   CHUNG với toàn bộ quyền sửa thông tin khách hàng khác, Admin không
  //   bật/tắt riêng được hành động này, và role chỉ có `customers.create`
  //   (không có `customers.edit`) vẫn không tick được nhóm ngay lúc vừa
  //   tạo khách hàng mới (use case checkbox "Tham gia nhóm" ở
  //   `CustomerForm.tsx` lúc tạo mới).
  // - CHỐT: tách hẳn permission riêng `customer_group_memberships.set`
  //   (migration `1779600000000-AddCustomerGroupMembershipSetPermission`)
  //   - Admin cấu hình độc lập qua `/phan-quyen`, mặc định Employee scope
  //   'own' (chỉ khách hàng của chính mình), Manager 'department', Admin/
  //   Assistant 'all' - đúng bảng chuẩn PERMISSIONS.md mục 1.
  @RequirePermission('customer_group_memberships.set')
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