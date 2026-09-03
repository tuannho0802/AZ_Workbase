import { Body, Controller, Get, Post, Query, Request, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AttendanceExportService } from './attendance-export.service';
import { QueryAttendanceLogDto } from '../zk-device/dto/query-attendance-log.dto';
import { QueryAttendanceSummaryDto } from '../zk-device/dto/query-attendance-summary.dto';
import { ExportMonthlyAttendanceDto } from './dto/export-monthly-attendance.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('Xuất Excel chấm công')
@ApiBearerAuth()
@Controller('attendance-export')
@UseGuards(JwtAuthGuard, RolesGuard)
// Khớp đúng phạm vi truy cập trang "/attendance-device" (PERMISSIONS.md mục
// 2.3) - ai xem được tab nào thì export được đúng tab đó; Manager tự động bị
// giới hạn đúng phòng ban mình quản lý NGAY TRONG zk-device.service.ts (2
// endpoint logs/summary export đều gọi lại đúng service đó, không lặp lại
// logic phân quyền ở đây).
@Roles(Role.ADMIN, Role.ASSISTANT, Role.MANAGER)
export class AttendanceExportController {
  constructor(private readonly exportService: AttendanceExportService) {}

  private sendXlsx(res: Response, buffer: Buffer, filename: string) {
    res.set({
      'Content-Type': XLSX_CONTENT_TYPE,
      // encodeURIComponent để tên file có dấu tiếng Việt/khoảng trắng vẫn
      // tải xuống đúng tên trên mọi trình duyệt (RFC 5987 - filename*).
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
    res.send(buffer);
  }

  @Get('logs')
  @ApiOperation({ summary: 'Xuất Excel tab "Logs chấm công" - y chang bảng gốc, có định dạng' })
  async exportLogs(
    @Query() query: QueryAttendanceLogDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.exportService.exportAttendanceLogs(
      query,
      req.user.id,
      req.user.role,
    );
    this.sendXlsx(res, buffer, filename);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Xuất Excel tab "Bảng chấm công" - y chang bảng gốc, có định dạng' })
  async exportSummary(
    @Query() query: QueryAttendanceSummaryDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.exportService.exportAttendanceSummary(
      query,
      req.user.id,
      req.user.role,
    );
    this.sendXlsx(res, buffer, filename);
  }

  @Post('monthly')
  @ApiOperation({
    summary:
      'Xuất Excel tab "Tổng hợp chấm công" - nhận thẳng dữ liệu ma trận đã tính sẵn từ FE (xem lý do kiến trúc trong attendance-export.service.ts), không tự tính lại ở BE',
  })
  async exportMonthly(@Body() dto: ExportMonthlyAttendanceDto, @Res() res: Response) {
    const { buffer, filename } = await this.exportService.exportMonthlyAttendance(dto);
    this.sendXlsx(res, buffer, filename);
  }
}
