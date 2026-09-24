import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { PeriodicTaskPerformanceService } from './periodic-task-performance.service';
import { PeriodicTaskPerformanceFiltersDto } from './dto/periodic-task-performance-filters.dto';
import type { RequestingUser } from './periodic-tasks.service';

/**
 * PeriodicTaskPerformanceController - "Hiệu suất công việc" (PLAN riêng,
 * xem JSDoc `PeriodicTaskPerformanceService`).
 *
 * ⚠️ CỐ Ý CHỈ `@UseGuards(JwtAuthGuard)` - KHÔNG gắn `PermissionGuard` +
 * `@RequirePermission()` như mọi controller `periodic_tasks.*` khác, vì
 * permission `periodic_tasks.performance_view` là "View bật/tắt" (tắt vẫn
 * xem được `own`, không chặn hẳn) - việc tra permission + fallback `own`
 * nằm trong `PeriodicTaskPerformanceService.resolveScope()`.
 */
@ApiTags('Periodic Tasks Performance (Hiệu suất công việc)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('periodic-tasks-performance')
export class PeriodicTaskPerformanceController {
  constructor(private readonly performanceService: PeriodicTaskPerformanceService) {}

  @Get('summary')
  @ApiOperation({
    summary:
      'Bảng tổng hợp Hiệu suất theo User (% hoàn thành / hoàn thành muộn / checklist). ' +
      'Không có quyền periodic_tasks.performance_view => chỉ trả về dòng của chính mình.',
  })
  getSummary(@Query() filters: PeriodicTaskPerformanceFiltersDto, @GetUser() user: RequestingUser) {
    return this.performanceService.getSummary(filters, user);
  }

  @Get('users/:userId/flagged-tasks')
  @ApiOperation({
    summary: 'Danh sách Task hoàn thành muộn / quá hạn chưa xong của 1 User (drill-down từ bảng tổng hợp).',
  })
  getUserFlaggedTasks(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() filters: PeriodicTaskPerformanceFiltersDto,
    @GetUser() user: RequestingUser,
  ) {
    return this.performanceService.getUserFlaggedTasks(userId, filters, user);
  }
}
