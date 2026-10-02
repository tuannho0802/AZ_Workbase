import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Guide } from '../../database/entities/guide.entity';
import { GuideRole } from '../../database/entities/guide-role.entity';
import { GuidePosition } from '../../database/entities/guide-position.entity';
import { GuideDepartment } from '../../database/entities/guide-department.entity';
import { RoleEntity } from '../../database/entities/role.entity';
import { Position } from '../../database/entities/position.entity';
import { Department } from '../../database/entities/department.entity';
import { User } from '../../database/entities/user.entity';
import { GuidesService } from './guides.service';
import { GuidesController } from './guides.controller';

// PermissionsModule (@Global) và AuditModule (@Global) cung cấp PermissionsService/AuditService như ở UtmsModule.
@Module({
  imports: [TypeOrmModule.forFeature([Guide, GuideRole, GuidePosition, GuideDepartment, RoleEntity, Position, Department, User])],
  controllers: [GuidesController],
  providers: [GuidesService],
  exports: [GuidesService],
})
export class GuidesModule {}
