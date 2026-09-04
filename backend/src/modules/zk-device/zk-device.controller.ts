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
  Request,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ZkDeviceService } from './zk-device.service';
import { MapDeviceUserDto } from './dto/map-device-user.dto';
import { QueryAttendanceLogDto } from './dto/query-attendance-log.dto';
import { QueryAttendanceSummaryDto } from './dto/query-attendance-summary.dto';
import { CleanupAttendanceLogsDto } from './dto/cleanup-attendance-logs.dto';
import { SyncAttendanceDto } from './dto/sync-attendance.dto';
import {
  parseLocalDateStart,
  parseLocalDateEnd,
} from '../../integrations/zk-device/decode-device-time.util';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('ZK Device (Máy chấm công)')
@ApiBearerAuth()
@Controller('zk-device')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  // FIX (2026-09-04): trước đây gắn `@RequirePermission('attendance.manage')`
  // Ở CẤP CLASS - khiến CẢ những route THUẦN ĐỌC (status, danh sách log, bảng
  // tổng hợp...) cũng đòi `attendance.manage`, trong khi những route đó đã có
  // permission `attendance.view` RIÊNG (seed sẵn từ đầu, tách biệt với
  // `attendance.manage` - xem migration `AddCustomRbacSystem`) nhưng chưa
  // từng được gắn vào route nào. Hậu quả thực tế: 1 role chỉ được cấp
  // `attendance.view` (không có `attendance.manage`) vẫn bị 403 ngay khi vào
  // trang - dù đúng ra phải xem được dữ liệu sẵn có, chỉ không được đồng
  // bộ/map/sync. Bỏ hẳn default ở cấp class - mỗi route giờ khai báo ĐÚNG
  // permission của mình (không có route nào "trần" nữa).
export class ZkDeviceController {
  constructor(private readonly zkDeviceService: ZkDeviceService) {}

  @Get('status')
  @RequirePermission('attendance.view')
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
  @RequirePermission('attendance.view')
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
  @RequirePermission('attendance.manage')
  @ApiOperation({ summary: 'Map 1 nhân viên trong hệ thống với mã user trên máy chấm công' })
  async mapUser(@Body() dto: MapDeviceUserDto, @Request() req: any) {
    return this.zkDeviceService.mapUser(dto.userId, dto.deviceUserId, req.user.id, req.user.role);
  }

  @Post('rematch')
  @RequirePermission('attendance.manage')
  @ApiOperation({
    summary:
      'Quét lại toàn bộ log chấm công đang chưa khớp nhân viên (matched_user_id NULL), khớp lại theo mapping hiện tại - dùng khi vừa map thêm người nhưng chưa muốn/chưa thể chạy đồng bộ đầy đủ (không cần kết nối máy chấm công, chỉ đọc/ghi DB)',
  })
  async rematch() {
    const updated = await this.zkDeviceService.rematchUnmatchedLogs();
    return { updated };
  }

  @Delete('map-user/:userId')
  @RequirePermission('attendance.manage')
  @ApiOperation({ summary: 'Gỡ mapping của 1 nhân viên (map nhầm) - không đụng log đã đồng bộ' })
  async unmapUser(@Param('userId', ParseIntPipe) userId: number, @Request() req: any) {
    return this.zkDeviceService.unmapUser(userId, req.user.id, req.user.role);
  }

  @Get('attendance-logs')
  @RequirePermission('attendance.view')
  @ApiOperation({
    summary:
      'Danh sách log chấm công đã đồng bộ (đọc-only), lọc theo nhân viên/khoảng ngày/trạng thái khớp',
  })
  async getAttendanceLogs(@Query() query: QueryAttendanceLogDto, @Request() req: any) {
    return this.zkDeviceService.getAttendanceLogs(query, req.user.id, req.user.role);
  }

  // FIX PERMISSIONS.md mục 1 (quy tắc Xoá) + mục 2.3: xoá log chấm công là
  // hành động Xoá thật (vĩnh viễn, không hoàn tác) - phải tách riêng khỏi
  // permission cấp class, khoá cứng CHỈ Admin, không có ngoại lệ cho Assistant.
  @Delete('attendance-logs/cleanup')
  @RequirePermission('attendance.delete')
  @ApiOperation({
    summary:
      'Dọn dẹp (xoá vĩnh viễn) log chấm công cũ hơn 1 mốc ngày - dùng khi bảng attendance_logs đã tích luỹ quá lâu, chiếm nhiều dung lượng DB. KHÔNG THỂ HOÀN TÁC. Chỉ Admin.',
  })
  async cleanupAttendanceLogs(@Query() query: CleanupAttendanceLogsDto) {
    return this.zkDeviceService.cleanupOldLogs(query.olderThan);
  }

  @Get('attendance-summary')
  @RequirePermission('attendance.view')
  @ApiOperation({
    summary:
      'Bảng chấm công tổng hợp theo ngày (giờ vào/giờ ra/đi muộn/về sớm), tính theo giờ VN (GMT+7)',
  })
  async getAttendanceSummary(@Query() query: QueryAttendanceSummaryDto, @Request() req: any) {
    return this.zkDeviceService.getAttendanceSummary(query, req.user.id, req.user.role);
  }

  @Post('sync')
  @RequirePermission('attendance.manage')
  @ApiOperation({
    summary:
      'Kích hoạt đồng bộ log chấm công ngay lập tức (thủ công). Có thể truyền from/to (YYYY-MM-DD) để chỉ đồng bộ 1 khoảng ngày - giúp nhẹ hơn/nhanh hơn cho các lần sync định kỳ, thay vì luôn quét lại toàn bộ lịch sử. Bỏ trống from/to = đồng bộ toàn bộ như trước.',
  })
  async syncNow(@Body() dto: SyncAttendanceDto) {
    try {
      return await this.zkDeviceService.syncNow({
        from: dto.from ? parseLocalDateStart(dto.from) : undefined,
        to: dto.to ? parseLocalDateEnd(dto.to) : undefined,
      });
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