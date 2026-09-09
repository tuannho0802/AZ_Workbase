import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Setting } from '../../database/entities/setting.entity';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';

// @Global(): đúng pattern AuditModule - UploadsService cần được inject
// thẳng vào UsersService (avatar) và LeaveRequestsService (đính kèm) mà
// không phải import UploadsModule lặp lại ở từng module đó.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Setting])],
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
