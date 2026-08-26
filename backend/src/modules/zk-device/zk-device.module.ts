import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { AttendanceLog } from '../../database/entities/attendance-log.entity';
import { ZkDeviceUserCache } from '../../database/entities/zk-device-user-cache.entity';
import { ZkDeviceService } from './zk-device.service';
import { ZkDeviceController } from './zk-device.controller';
import { ZkDeviceCronController } from './zk-device-cron.controller';
import { AdmsController } from './adms.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, AttendanceLog, ZkDeviceUserCache])],
  controllers: [ZkDeviceController, ZkDeviceCronController, AdmsController],
  providers: [ZkDeviceService],
  exports: [ZkDeviceService],
})
export class ZkDeviceModule { }