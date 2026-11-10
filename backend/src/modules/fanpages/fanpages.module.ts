import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Fanpage } from '../../database/entities/fanpage.entity';
import { FanpagePlatform } from '../../database/entities/fanpage-platform.entity';
import { FanpagePost } from '../../database/entities/fanpage-post.entity';
import { FanpageNote } from '../../database/entities/fanpage-note.entity';
import { User } from '../../database/entities/user.entity';
import { FanpageAccessService } from './fanpage-access.service';
import { FanpagesService } from './fanpages.service';
import { FanpagePostsService } from './fanpage-posts.service';
import { FanpageNotesService } from './fanpage-notes.service';
import { FanpagePlatformsService } from './fanpage-platforms.service';
import {
  FanpagesController,
  FanpagePostsController,
  FanpageNotesController,
  FanpagePlatformsController,
} from './fanpages.controller';

// PermissionsModule (@Global) và AuditModule cung cấp PermissionsService/AuditService như ở UtmsModule.
@Module({
  imports: [TypeOrmModule.forFeature([Fanpage, FanpagePlatform, FanpagePost, FanpageNote, User])],
  controllers: [FanpagesController, FanpagePostsController, FanpageNotesController, FanpagePlatformsController],
  providers: [FanpageAccessService, FanpagesService, FanpagePostsService, FanpageNotesService, FanpagePlatformsService],
})
export class FanpagesModule {}
