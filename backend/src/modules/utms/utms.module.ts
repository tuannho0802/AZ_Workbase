import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Utm } from '../../database/entities/utm.entity';
import { UtmSecondaryManager } from '../../database/entities/utm-secondary-manager.entity';
import { User } from '../../database/entities/user.entity';
import { UtmsService } from './utms.service';
import { UtmManagersService } from './utm-managers.service';
import { UtmsController } from './utms.controller';

// PermissionsModule (@Global) và AuditModule cung cấp PermissionsService/AuditService như ở LinkGroupsModule.
@Module({
  imports: [TypeOrmModule.forFeature([Utm, UtmSecondaryManager, User])],
  controllers: [UtmsController],
  providers: [UtmsService, UtmManagersService],
  exports: [UtmsService, UtmManagersService],
})
export class UtmsModule {}
