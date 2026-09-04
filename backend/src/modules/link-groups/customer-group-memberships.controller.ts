import { Controller, Get, Patch, Param, ParseIntPipe, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
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
  async getMemberships(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    return this.membershipsService.getMembershipsForCustomer(id, user.id, user.role);
  }

  @Patch(':id/group-memberships/:groupId')
  @RequirePermission('customers.manage')
  @ApiOperation({ summary: 'Bật/tắt trạng thái đã join của customer với 1 group' })
  async setMembership(
    @Param('id', ParseIntPipe) id: number,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() dto: SetMembershipDto,
    @GetUser() user: any,
  ) {
    return this.membershipsService.setMembership(id, groupId, dto.joined, user.id, user.role);
  }
}