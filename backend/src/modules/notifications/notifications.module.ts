import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from '../../database/entities/notification.entity';
import { NotificationPreference } from '../../database/entities/notification-preference.entity';
import { NotificationBroadcast } from '../../database/entities/notification-broadcast.entity';
import { User } from '../../database/entities/user.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

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
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
