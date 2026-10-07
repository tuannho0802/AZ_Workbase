import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

// PermissionsModule và AuditModule đều @Global() nên không cần import ở đây.
@Module({
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
