import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { PeriodicTaskStatus } from '../../database/entities/periodic-task-status.entity';
import { PeriodicTaskLink } from '../../database/entities/periodic-task-link.entity';
import { PeriodicTaskCustomer } from '../../database/entities/periodic-task-customer.entity';
import { PeriodicTaskSecondaryAssignee } from '../../database/entities/periodic-task-secondary-assignee.entity';
import { PeriodicTaskChecklistItem } from '../../database/entities/periodic-task-checklist-item.entity';
import { Customer } from '../../database/entities/customer.entity';
import { User } from '../../database/entities/user.entity';
import { DepartmentManager } from '../../database/entities/department-manager.entity';
import { PeriodicTasksService } from './periodic-tasks.service';
import { PeriodicTaskLinksService } from './periodic-task-links.service';
import { PeriodicTaskCustomersService } from './periodic-task-customers.service';
import { PeriodicTaskSecondaryAssigneesService } from './periodic-task-secondary-assignees.service';
import { PeriodicTaskChecklistItemsService } from './periodic-task-checklist-items.service';
import { PeriodicTasksController } from './periodic-tasks.controller';

// PermissionsService KHÔNG cần import ở `imports` - PermissionsModule là
// @Global() (xem permissions.module.ts), inject thẳng vào
// PeriodicTaskCustomersService được luôn.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PeriodicTask,
      PeriodicTaskStatus,
      PeriodicTaskLink,
      PeriodicTaskCustomer,
      PeriodicTaskSecondaryAssignee,
      PeriodicTaskChecklistItem,
      Customer,
      User,
      DepartmentManager,
    ]),
  ],
  controllers: [PeriodicTasksController],
  providers: [
    PeriodicTasksService,
    PeriodicTaskLinksService,
    PeriodicTaskCustomersService,
    PeriodicTaskSecondaryAssigneesService,
    PeriodicTaskChecklistItemsService,
  ],
  exports: [
    PeriodicTasksService,
    PeriodicTaskLinksService,
    PeriodicTaskCustomersService,
    PeriodicTaskSecondaryAssigneesService,
    PeriodicTaskChecklistItemsService,
  ],
})
export class PeriodicTasksModule { }