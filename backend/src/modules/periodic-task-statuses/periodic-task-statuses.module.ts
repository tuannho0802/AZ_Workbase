import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PeriodicTaskStatus } from '../../database/entities/periodic-task-status.entity';
import { PeriodicTask } from '../../database/entities/periodic-task.entity';
import { PeriodicTaskStatusesService } from './periodic-task-statuses.service';
import { PeriodicTaskStatusesController } from './periodic-task-statuses.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PeriodicTaskStatus, PeriodicTask])],
  controllers: [PeriodicTaskStatusesController],
  providers: [PeriodicTaskStatusesService],
  exports: [PeriodicTaskStatusesService],
})
export class PeriodicTaskStatusesModule {}
