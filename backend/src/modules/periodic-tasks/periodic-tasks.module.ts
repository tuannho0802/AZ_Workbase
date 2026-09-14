import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { PeriodicTaskStatus } from '../../database/entities/periodic-task-status.entity';
import { User } from '../../database/entities/user.entity';
import { DepartmentManager } from '../../database/entities/department-manager.entity';
import { PeriodicTasksService } from './periodic-tasks.service';
import { PeriodicTasksController } from './periodic-tasks.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PeriodicTask, PeriodicTaskStatus, User, DepartmentManager])],
  controllers: [PeriodicTasksController],
  providers: [PeriodicTasksService],
  exports: [PeriodicTasksService],
})
export class PeriodicTasksModule {}
