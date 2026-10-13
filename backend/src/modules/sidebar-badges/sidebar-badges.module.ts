import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { UsersModule } from '../users/users.module';
import { LeaveRequestsModule } from '../leave-requests/leave-requests.module';
import { PeriodicTasksModule } from '../periodic-tasks/periodic-tasks.module';
import { SidebarBadgesController } from './sidebar-badges.controller';
import { SidebarBadgesService } from './sidebar-badges.service';
import { BadgeCacheInvalidationMiddleware } from './badge-cache-invalidation.middleware';

// PermissionsModule là @Global() nên không cần import ở đây.
@Module({
  imports: [CustomersModule, UsersModule, LeaveRequestsModule, PeriodicTasksModule],
  controllers: [SidebarBadgesController],
  providers: [SidebarBadgesService, BadgeCacheInvalidationMiddleware],
})
export class SidebarBadgesModule implements NestModule {
  // Mọi route: request ghi thành công -> xoá cache số đếm badge của instance (lọc method/đường dẫn trong middleware).
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(BadgeCacheInvalidationMiddleware).forRoutes('*path');
  }
}
