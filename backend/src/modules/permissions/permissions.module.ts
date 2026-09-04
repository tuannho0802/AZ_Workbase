import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolePermission } from '../../database/entities/role-permission.entity';
import { PermissionsService } from './permissions.service';

// @Global(): PermissionGuard cần PermissionsService ở MỌI module có route
// dùng @RequirePermission() - import lại module này ở từng module một sẽ
// rất dễ quên. Cùng lý do JwtAuthGuard/RolesGuard cũ được dùng xuyên suốt
// mà không cần import module ở từng nơi.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([RolePermission])],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
