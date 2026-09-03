import { Module } from '@nestjs/common';
import { ZkDeviceModule } from '../zk-device/zk-device.module';
import { AttendanceExportController } from './attendance-export.controller';
import { AttendanceExportService } from './attendance-export.service';

@Module({
    imports: [ZkDeviceModule],
    controllers: [AttendanceExportController],
    providers: [AttendanceExportService],
})
export class AttendanceExportModule { }