import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveRequest } from '../../database/entities/leave-request.entity';
import { LeaveRequestAttachment } from '../../database/entities/leave-request-attachment.entity';
import { User } from '../../database/entities/user.entity';
import { Department } from '../../database/entities/department.entity';
import { LeaveRequestsService } from './leave-requests.service';
import { LeaveRequestsController } from './leave-requests.controller';
import { LeaveTypesModule } from '../leave-types/leave-types.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeaveRequest, LeaveRequestAttachment, User, Department]),
    // Đọc động isPaid/deductsAnnualBalance theo leaveType.code - thay hoàn
    // toàn so sánh cứng LeaveType.ANNUAL/SICK cũ (xem LeaveRequestsService).
    // (UploadsModule không cần import - @Global(), đã sẵn có từ trước.)
    LeaveTypesModule,
  ],
  controllers: [LeaveRequestsController],
  providers: [LeaveRequestsService],
  exports: [LeaveRequestsService]
})
export class LeaveRequestsModule { }