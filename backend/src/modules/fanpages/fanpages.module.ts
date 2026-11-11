import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Fanpage } from '../../database/entities/fanpage.entity';
import { FanpagePlatform } from '../../database/entities/fanpage-platform.entity';
import { FanpagePost } from '../../database/entities/fanpage-post.entity';
import { FanpageNote } from '../../database/entities/fanpage-note.entity';
import { FanpageHealthStatus } from '../../database/entities/fanpage-health-status.entity';
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
import {
  FanpagesController,
  FanpagePostsController,
  FanpageNotesController,
  FanpagePlatformsController,
  FanpageHealthStatusesController,
} from './fanpages.controller';

// PermissionsModule (@Global) và AuditModule cung cấp PermissionsService/AuditService như ở UtmsModule.
@Module({
  imports: [TypeOrmModule.forFeature([Fanpage, FanpagePlatform, FanpagePost, FanpageNote, FanpageHealthStatus, Setting, AuditLog, User])],
  controllers: [
    FanpagesController,
    FanpagePostsController,
    FanpageNotesController,
    FanpagePlatformsController,
    FanpageHealthStatusesController,
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
  ],
})
export class FanpagesModule {}
