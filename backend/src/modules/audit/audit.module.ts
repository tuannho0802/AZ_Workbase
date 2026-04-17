import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { Setting } from '../../database/entities/setting.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, Setting])],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
