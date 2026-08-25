import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { AttendanceLog } from '../../database/entities/attendance-log.entity';
import { ZkDeviceService } from './zk-device.service';
import { ZkDeviceController } from './zk-device.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, AttendanceLog])],
  controllers: [ZkDeviceController],
  providers: [ZkDeviceService],
  exports: [ZkDeviceService],
})
export class ZkDeviceModule {}
