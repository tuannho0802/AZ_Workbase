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

// ⚠️ Controller này đăng ký chung base path 'customers' với CustomersController
// (ở module Customers khác) nhưng KHÔNG đụng route nào đã có (:id/notes,
// :id/deposits...) - NestJS cho phép nhiều controller cùng base path miễn
// không trùng full route+method. Tách riêng module để không phải sửa vào
// customers.controller.ts/customers.service.ts vốn đã rất lớn (1200+ dòng).
@ApiTags('Customer Group Memberships (đã join nhóm nào)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomerGroupMembershipsController {
  constructor(private readonly membershipsService: CustomerGroupMembershipsService) {}

  // Không giới hạn role - giống pattern createNote() hiện có của customer
  // (mọi nhân viên đã đăng nhập đều thao tác được trên customer họ thấy
  // được trong danh sách; không thêm 1 tầng kiểm tra "chỉ đúng sales phụ
  // trách" vì các sub-resource khác của customer hiện tại cũng chưa làm vậy).
  @Get(':id/group-memberships')
  @ApiOperation({ summary: 'Checklist toàn bộ nhóm (theo category) + trạng thái đã join của customer này' })
  async getMemberships(@Param('id', ParseIntPipe) id: number, @GetUser() user: any) {
    return this.membershipsService.getMembershipsForCustomer(id, user.id, user.role);
  }

  @Patch(':id/group-memberships/:groupId')
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