import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Guide } from '../../database/entities/guide.entity';
import { GuideRole } from '../../database/entities/guide-role.entity';
import { RoleEntity } from '../../database/entities/role.entity';
import { GuidesService } from './guides.service';
import { GuidesController } from './guides.controller';

// PermissionsModule (@Global) và AuditModule (@Global) cung cấp PermissionsService/AuditService như ở UtmsModule.
@Module({
  imports: [TypeOrmModule.forFeature([Guide, GuideRole, RoleEntity])],
  controllers: [GuidesController],
  providers: [GuidesService],
  exports: [GuidesService],
})
export class GuidesModule {}
