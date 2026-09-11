import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PositionsService } from './positions.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('Positions (Vị trí)')
  @Controller('positions')
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  // ⚠️ PHẢI khai báo TRƯỚC route `:id` bên dưới - nếu không Nest sẽ match
  // "GET /positions/public" vào route `:id` (coi "public" là giá trị id),
  // đúng thứ tự đã áp dụng ở DepartmentsController.findAllPublic().
  @Get('public')
  @ApiOperation({
    summary:
      'Danh sách Vị trí (công khai, KHÔNG cần đăng nhập) - chỉ id/name, dùng cho form đăng ký tài khoản',
  })
  findAllPublic() {
    return this.positionsService.findAllPublic();
  }

  // ⚠️ CỐ Ý KHÔNG gắn @RequirePermission('positions.view') ở GET / và
  // GET /:id nữa (chỉ còn JwtAuthGuard) - permission này CHỈ dùng để FE gate
  // sidebar/trang "Vị trí" (nav-config.tsx, vi-tri/page.tsx). GET / còn được
  // usePositions() gọi từ chia-data/page.tsx (bộ lọc Vị trí khi chia data -
  // trang mọi nhân viên có customers.assign đều vào được) - dùng chung 1
  // permission cho cả 2 mục đích khiến Admin tắt 'positions.view' để ẩn
  // trang quản lý vô tình phá luôn Chia Data. Mirror đúng cách fix ở
  // leave-types.controller.ts / departments.controller.ts.
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách tất cả Vị trí (mọi user đã đăng nhập, không cần permission riêng)' })
  findAll() {
    return this.positionsService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy chi tiết 1 Vị trí (mọi user đã đăng nhập, không cần permission riêng)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.positionsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('positions.manage')
  @ApiOperation({ summary: 'Tạo Vị trí mới' })
  create(@Body() dto: CreatePositionDto) {
    return this.positionsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('positions.manage')
  @ApiOperation({ summary: 'Sửa Vị trí (không đổi được code)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePositionDto) {
    return this.positionsService.update(id, dto);
  }

  // ⚠️ Xoá tách riêng khỏi `positions.manage` (tạo/sửa) từ migration
  // AddPositionsDeletePermission1780600000000 - mirror đúng pattern
  // departments.manage/departments.delete, cho phép Admin cấp quyền tạo/sửa
  // Vị trí mà KHÔNG kèm quyền xoá.
  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('positions.delete')
  @ApiOperation({ summary: 'Xoá Vị trí (chặn nếu đang có nhân viên gán)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.positionsService.remove(id);
  }
}