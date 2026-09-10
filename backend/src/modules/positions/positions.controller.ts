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

  @Get()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('positions.view')
  @ApiOperation({ summary: 'Danh sách tất cả Vị trí' })
  findAll() {
    return this.positionsService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('positions.view')
  @ApiOperation({ summary: 'Lấy chi tiết 1 Vị trí' })
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

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @ApiBearerAuth()
  @RequirePermission('positions.manage')
  @ApiOperation({ summary: 'Xoá Vị trí (chặn nếu đang có nhân viên gán)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.positionsService.remove(id);
  }
}