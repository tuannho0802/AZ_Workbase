import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from '../../database/entities/notification.entity';
import { NotificationPreference } from '../../database/entities/notification-preference.entity';
import { NotificationBroadcast } from '../../database/entities/notification-broadcast.entity';
import { User } from '../../database/entities/user.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationBroadcastsService } from './broadcasts/notification-broadcasts.service';
import { NotificationBroadcastsController } from './broadcasts/notification-broadcasts.controller';

/**
 * @Global() theo đúng mẫu `AuditModule` (PLAN 0.2): mọi service nghiệp vụ
 * (customers, periodic-tasks...) inject `NotificationsService` mà KHÔNG cần
 * import module → tránh phụ thuộc vòng `customers ↔ notifications`.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      NotificationPreference,
      NotificationBroadcast,
      User,
    ]),
  ],
  // [M1] NotificationBroadcastsController dùng PermissionGuard (khác
  // NotificationsController - hộp thư cá nhân chỉ JwtAuthGuard) -
  // PermissionsService lấy từ PermissionsModule (@Global(), không cần import).
  controllers: [NotificationsController, NotificationBroadcastsController],
  providers: [NotificationsService, NotificationBroadcastsService],
  exports: [NotificationsService, NotificationBroadcastsService],
})
export class NotificationsModule {}
