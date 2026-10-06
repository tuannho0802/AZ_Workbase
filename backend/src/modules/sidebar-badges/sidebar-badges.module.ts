import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { UsersModule } from '../users/users.module';
import { LeaveRequestsModule } from '../leave-requests/leave-requests.module';
import { PeriodicTasksModule } from '../periodic-tasks/periodic-tasks.module';
import { SidebarBadgesController } from './sidebar-badges.controller';
import { SidebarBadgesService } from './sidebar-badges.service';

// PermissionsModule là @Global() nên không cần import ở đây.
@Module({
  imports: [CustomersModule, UsersModule, LeaveRequestsModule, PeriodicTasksModule],
  controllers: [SidebarBadgesController],
  providers: [SidebarBadgesService],
})
export class SidebarBadgesModule {}
