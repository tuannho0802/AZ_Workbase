import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Setting } from '../../database/entities/setting.entity';
import { CronRun } from '../../database/entities/cron-run.entity';
import { RetentionService } from './retention.service';
import { RetentionController } from './retention.controller';
import { RetentionCronController } from './retention-cron.controller';

// AuditModule và PermissionsModule đều @Global() nên không cần import ở đây.
@Module({
  imports: [TypeOrmModule.forFeature([Setting, CronRun])],
  controllers: [RetentionController, RetentionCronController],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
