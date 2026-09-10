import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentGroupConfig } from '../../database/entities/assignment-group-config.entity';
import { AssignmentGroupConfigDepartment } from '../../database/entities/assignment-group-config-department.entity';
import { AssignmentGroupConfigPosition } from '../../database/entities/assignment-group-config-position.entity';
import { User } from '../../database/entities/user.entity';
import { AssignmentGroupsService } from './assignment-groups.service';
import { AssignmentGroupsController } from './assignment-groups.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AssignmentGroupConfig,
      AssignmentGroupConfigDepartment,
      AssignmentGroupConfigPosition,
      User,
    ]),
  ],
  controllers: [AssignmentGroupsController],
  providers: [AssignmentGroupsService],
  exports: [AssignmentGroupsService],
})
export class AssignmentGroupsModule {}
