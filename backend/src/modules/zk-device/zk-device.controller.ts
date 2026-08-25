import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ZkDeviceService } from './zk-device.service';
import { MapDeviceUserDto } from './dto/map-device-user.dto';
import { QueryAttendanceLogDto } from './dto/query-attendance-log.dto';
import { QueryAttendanceSummaryDto } from './dto/query-attendance-summary.dto';
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
        `Không kết nối được tới máy chấm công: ${this.getErrorMessage(err)}`,
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
        `Không lấy được danh sách user từ máy: ${this.getErrorMessage(err)}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Post('map-user')
  @ApiOperation({ summary: 'Map 1 nhân viên trong hệ thống với mã user trên máy chấm công' })
  async mapUser(@Body() dto: MapDeviceUserDto) {
    return this.zkDeviceService.mapUser(dto.userId, dto.deviceUserId);
  }

  @Post('rematch')
  @ApiOperation({
    summary:
      'Quét lại toàn bộ log chấm công đang chưa khớp nhân viên (matched_user_id NULL), khớp lại theo mapping hiện tại - dùng khi vừa map thêm người nhưng chưa muốn/chưa thể chạy đồng bộ đầy đủ (không cần kết nối máy chấm công, chỉ đọc/ghi DB)',
  })
  async rematch() {
    const updated = await this.zkDeviceService.rematchUnmatchedLogs();
    return { updated };
  }

  @Delete('map-user/:userId')
  @ApiOperation({ summary: 'Gỡ mapping của 1 nhân viên (map nhầm) - không đụng log đã đồng bộ' })
  async unmapUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.zkDeviceService.unmapUser(userId);
  }

  @Get('attendance-logs')
  @ApiOperation({
    summary:
      'Danh sách log chấm công đã đồng bộ (đọc-only), lọc theo nhân viên/khoảng ngày/trạng thái khớp',
  })
  async getAttendanceLogs(@Query() query: QueryAttendanceLogDto) {
    return this.zkDeviceService.getAttendanceLogs(query);
  }

  @Get('attendance-summary')
  @ApiOperation({
    summary:
      'Bảng chấm công tổng hợp theo ngày (giờ vào/giờ ra/đi muộn/về sớm), tính theo giờ VN (GMT+7)',
  })
  async getAttendanceSummary(@Query() query: QueryAttendanceSummaryDto) {
    return this.zkDeviceService.getAttendanceSummary(query);
  }

  @Post('sync')
  @ApiOperation({ summary: 'Kích hoạt đồng bộ log chấm công ngay lập tức (thủ công)' })
  async syncNow() {
    try {
      return await this.zkDeviceService.syncNow();
    } catch (err) {
      throw new HttpException(
        `Đồng bộ thất bại: ${this.getErrorMessage(err)}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * catch (err) mặc định có kiểu `unknown` (strict mode) nên KHÔNG được
   * truy cập err.message trực tiếp - phải kiểm tra instanceof Error trước.
   * Gom vào 1 hàm dùng chung để không lặp lại logic này ở từng nơi.
   *
   * ⚠️ Lỗi từ node-zklib là class `ZKError` riêng, KHÔNG kế thừa `Error`
   * chuẩn của JS (this.err/this.command/this.ip là field tự định nghĩa) -
   * nên `instanceof Error` luôn false với lỗi loại này, rơi vào
   * `String(err)` cho ra "[object Object]" vô nghĩa. Nhận diện thêm hình
   * dạng ZKError (có field `err` lồng bên trong) để lấy đúng message/code
   * thật, giúp debug được (vd ECONNREFUSED, ETIMEDOUT, sai comm key...).
   */
  private getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (
      typeof err === 'object' &&
      err !== null &&
      'err' in err &&
      typeof (err as { err?: unknown }).err === 'object'
    ) {
      const inner = (err as { err: { message?: string; code?: string } }).err;
      return [inner.code, inner.message].filter(Boolean).join(' - ') || String(err);
    }
    if (typeof err === 'object' && err !== null) {
      try {
        return JSON.stringify(err);
      } catch {
        return String(err);
      }
    }
    return String(err);
  }
}