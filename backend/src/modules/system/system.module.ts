import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';
import { SystemHealthService } from './system-health.service';
import { RetentionModule } from '../retention/retention.module';

// PermissionsModule và AuditModule đều @Global() nên không cần import ở đây.
@Module({
  imports: [RetentionModule],
  controllers: [SystemController],
  providers: [SystemService, SystemHealthService],
})
export class SystemModule {}
