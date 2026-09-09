import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveRequest } from '../../database/entities/leave-request.entity';
import { LeaveRequestAttachment } from '../../database/entities/leave-request-attachment.entity';
import { User } from '../../database/entities/user.entity';
import { Department } from '../../database/entities/department.entity';
import { LeaveRequestsService } from './leave-requests.service';
import { LeaveRequestsController } from './leave-requests.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeaveRequest, LeaveRequestAttachment, User, Department])
  ],
  controllers: [LeaveRequestsController],
  providers: [LeaveRequestsService],
  exports: [LeaveRequestsService]
})
export class LeaveRequestsModule { }