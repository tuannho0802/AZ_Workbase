import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Setting } from '../../database/entities/setting.entity';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { StorageCronController } from './storage-cron.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Setting])],
  controllers: [StorageController, StorageCronController],
  providers: [StorageService],
})
export class StorageModule {}
