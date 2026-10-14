import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Role } from '../../common/enums/role.enum';
import { RetentionService } from './retention.service';
import { RetentionRunNowDto, UpdateRetentionSettingsDto } from './dto/retention.dto';

/**
 * Cấu hình + chạy tay Retention. Dùng permission SẴN CÓ `audit.view`/`audit.manage` (không tạo key mới).
 * Riêng cấu hình/chạy dữ liệu chấm công chỉ Admin (khớp `attendance.delete`).
 */
@ApiTags('System Retention')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('system')
export class RetentionController {
  constructor(private readonly retentionService: RetentionService) {}

  @Get('retention-settings')
  @RequirePermission('audit.view')
  @ApiOperation({ summary: 'Cấu hình Retention + lần chạy gần nhất / lần chạy tiếp theo (tính bằng số giây theo đồng hồ DB)' })
  getSettings() {
    return this.retentionService.getSettingsWithSchedule();
  }

  @Put('retention-settings')
  @RequirePermission('audit.manage')
  @ApiOperation({ summary: 'Cập nhật cấu hình Retention (bật/tắt, số ngày giữ, chu kỳ 7–90 ngày)' })
  updateSettings(@Body() dto: UpdateRetentionSettingsDto, @Req() req: { user: { id: number; role: string } }) {
    return this.retentionService.updateSettings(dto, req.user);
  }

  @Post('retention/run-now')
  @HttpCode(200)
  @RequirePermission('audit.manage')
  @ApiOperation({ summary: 'Chạy Retention ngay. `dryRun=true` chỉ đếm số dòng sẽ xoá. `target` bỏ trống = mọi đối tượng đang bật.' })
  runNow(@Query() query: RetentionRunNowDto, @Req() req: { user: { id: number; role: string } }) {
    // Chạy THẬT toàn bộ (gồm dữ liệu chấm công/lương) hoặc riêng chấm công: chỉ Admin.
    // Chạy thử (dryRun) không ghi gì nên mọi người có `audit.manage` đều xem được.
    const dryRun = query.dryRun === 'true';
    if (!dryRun && req.user.role !== Role.ADMIN && (!query.target || query.target === 'attendance_logs')) {
      throw new ForbiddenException('Chỉ Admin được chạy xoá toàn bộ hoặc xoá dữ liệu chấm công.');
    }
    return this.retentionService.run({ target: query.target, dryRun });
  }
}
