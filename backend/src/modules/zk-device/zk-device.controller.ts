import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ZkDeviceService } from './zk-device.service';
import { MapDeviceUserDto } from './dto/map-device-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

@ApiTags('ZK Device (Máy chấm công)')
@ApiBearerAuth()
@Controller('zk-device')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ZkDeviceController {
  constructor(private readonly zkDeviceService: ZkDeviceService) {}

  @Get('status')
  @ApiOperation({ summary: 'Kiểm tra nhanh tình trạng kết nối tới máy chấm công' })
  async getStatus() {
    try {
      return await this.zkDeviceService.getStatus();
    } catch (err) {
      throw new HttpException(
        `Không kết nối được tới máy chấm công: ${err?.message ?? err}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('device-users')
  @ApiOperation({
    summary: 'Danh sách user đăng ký trên máy chấm công, kèm trạng thái đã map với nhân viên hệ thống hay chưa',
  })
  async getDeviceUsers() {
    try {
      return await this.zkDeviceService.getDeviceUsers();
    } catch (err) {
      throw new HttpException(
        `Không lấy được danh sách user từ máy: ${err?.message ?? err}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Post('map-user')
  @ApiOperation({ summary: 'Map 1 nhân viên trong hệ thống với mã user trên máy chấm công' })
  async mapUser(@Body() dto: MapDeviceUserDto) {
    return this.zkDeviceService.mapUser(dto.userId, dto.deviceUserId);
  }

  @Post('sync')
  @ApiOperation({ summary: 'Kích hoạt đồng bộ log chấm công ngay lập tức (thủ công)' })
  async syncNow() {
    try {
      return await this.zkDeviceService.syncNow();
    } catch (err) {
      throw new HttpException(
        `Đồng bộ thất bại: ${err?.message ?? err}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
