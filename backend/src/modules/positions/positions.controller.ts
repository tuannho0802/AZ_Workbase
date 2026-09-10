import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PositionsService } from './positions.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('Positions (Vị trí)')
@ApiBearerAuth()
@Controller('positions')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Get()
  @RequirePermission('positions.manage')
  @ApiOperation({ summary: 'Danh sách tất cả Vị trí' })
  findAll() {
    return this.positionsService.findAll();
  }

  @Get(':id')
  @RequirePermission('positions.manage')
  @ApiOperation({ summary: 'Lấy chi tiết 1 Vị trí' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.positionsService.findOne(id);
  }

  @Post()
  @RequirePermission('positions.manage')
  @ApiOperation({ summary: 'Tạo Vị trí mới' })
  create(@Body() dto: CreatePositionDto) {
    return this.positionsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('positions.manage')
  @ApiOperation({ summary: 'Sửa Vị trí (không đổi được code)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePositionDto) {
    return this.positionsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('positions.manage')
  @ApiOperation({ summary: 'Xoá Vị trí (chặn nếu đang có nhân viên gán)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.positionsService.remove(id);
  }
}
