import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Utm } from '../../database/entities/utm.entity';
import { UtmSecondaryManager } from '../../database/entities/utm-secondary-manager.entity';
import { User } from '../../database/entities/user.entity';
import { UtmsService } from './utms.service';
import { UtmManagersService } from './utm-managers.service';
import { UtmsController } from './utms.controller';
import { UtmCustomersService } from './utm-customers.service';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import { UtmStatsService } from './utm-stats.service';
import { UiVisibilityModule } from '../ui-visibility/ui-visibility.module';

// PermissionsModule (@Global) và AuditModule cung cấp PermissionsService/AuditService như ở LinkGroupsModule.
@Module({
  imports: [TypeOrmModule.forFeature([Utm, UtmSecondaryManager, User, Customer, CustomerStatus]), UiVisibilityModule],
  controllers: [UtmsController],
  providers: [UtmsService, UtmManagersService, UtmCustomersService, UtmStatsService],
  exports: [UtmsService, UtmManagersService],
})
export class UtmsModule {}
