import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveRequest } from '../../database/entities/leave-request.entity';
import { User } from '../../database/entities/user.entity';
import { LeaveRequestsService } from './leave-requests.service';
import { LeaveRequestsController } from './leave-requests.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeaveRequest, User])
  ],
  controllers: [LeaveRequestsController],
  providers: [LeaveRequestsService],
  exports: [LeaveRequestsService]
})
export class LeaveRequestsModule {}
