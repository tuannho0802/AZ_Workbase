import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Fanpage } from '../../database/entities/fanpage.entity';
import { FanpagePlatform } from '../../database/entities/fanpage-platform.entity';
import { FanpagePost } from '../../database/entities/fanpage-post.entity';
import { FanpageNote } from '../../database/entities/fanpage-note.entity';
import { FanpageHealthStatus } from '../../database/entities/fanpage-health-status.entity';
import { FanpageMetricSnapshot } from '../../database/entities/fanpage-metric-snapshot.entity';
import { FanpageTarget } from '../../database/entities/fanpage-target.entity';
import { FanpageUtm } from '../../database/entities/fanpage-utm.entity';
import { Customer } from '../../database/entities/customer.entity';
import { Deposit } from '../../database/entities/deposit.entity';
import { UtmsModule } from '../utms/utms.module';
import { UiVisibilityModule } from '../ui-visibility/ui-visibility.module';
import { Setting } from '../../database/entities/setting.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { User } from '../../database/entities/user.entity';
import { FanpageAccessService } from './fanpage-access.service';
import { FanpagesService } from './fanpages.service';
import { FanpagePostsService } from './fanpage-posts.service';
import { FanpageNotesService } from './fanpage-notes.service';
import { FanpagePlatformsService } from './fanpage-platforms.service';
import { FanpageHealthStatusesService } from './fanpage-health-statuses.service';
import { FanpageSettingsService } from './fanpage-settings.service';
import { FanpageInsightsService } from './fanpage-insights.service';
import { FanpageScopedQuery } from './fanpage-scoped-query';
import { FanpageOverviewService } from './fanpage-overview.service';
import { FanpageHistoryService } from './fanpage-history.service';
import { FanpageTodayService } from './fanpage-today.service';
import { FanpageMetricsService } from './fanpage-metrics.service';
import { FanpageStatsService } from './fanpage-stats.service';
import { FanpageUtmsService } from './fanpage-utms.service';
import { FanpageOutcomesService } from './fanpage-outcomes.service';
import { FanpageRemindersService } from './fanpage-reminders.service';
import { FanpagesCronController } from './fanpages-cron.controller';
import {
  FanpagesController,
  FanpageStatsController,
  FanpageSnapshotsController,
  FanpageMetricsController,
  FanpagePostsController,
  FanpageNotesController,
  FanpagePlatformsController,
  FanpageHealthStatusesController,
} from './fanpages.controller';

// PermissionsModule (@Global) và AuditModule cung cấp PermissionsService/AuditService như ở UtmsModule.
@Module({
  imports: [
    TypeOrmModule.forFeature([Fanpage, FanpagePlatform, FanpagePost, FanpageNote, FanpageHealthStatus, FanpageMetricSnapshot, FanpageTarget, FanpageUtm, Customer, Deposit, Setting, AuditLog, User]),
    UtmsModule, // UtmsService.usabilityFor + UtmCustomersService (không vòng: UtmsService chỉ import HÀM thuần của fanpages/helpers)
    UiVisibilityModule,
  ],
  // THỨ TỰ có nghĩa: FanpageStatsController (`fanpages/stats/posts`) phải đứng TRƯỚC FanpagePostsController (`fanpages/:fanpageId/posts`).
  controllers: [
    FanpagesController,
    FanpageStatsController,
    FanpageSnapshotsController,
    FanpageMetricsController,
    FanpagePostsController,
    FanpageNotesController,
    FanpagePlatformsController,
    FanpageHealthStatusesController,
    FanpagesCronController,
  ],
  providers: [
    FanpageAccessService,
    FanpagesService,
    FanpagePostsService,
    FanpageNotesService,
    FanpagePlatformsService,
    FanpageHealthStatusesService,
    FanpageSettingsService,
    FanpageInsightsService,
    FanpageScopedQuery,
    FanpageOverviewService,
    FanpageHistoryService,
    FanpageTodayService,
    FanpageRemindersService,
    FanpageMetricsService,
    FanpageStatsService,
    FanpageUtmsService,
    FanpageOutcomesService,
  ],
  // SidebarBadgesService đếm badge "cần đăng bài" bằng đúng nguồn của tab Hôm nay (X2/X16).
  exports: [FanpageTodayService],
})
export class FanpagesModule {}
