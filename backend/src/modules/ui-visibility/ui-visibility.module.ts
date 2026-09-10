import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UiVisibilityRule } from '../../database/entities/ui-visibility-rule.entity';
import { RoleEntity } from '../../database/entities/role.entity';
import { Department } from '../../database/entities/department.entity';
import { Position } from '../../database/entities/position.entity';
import { UiVisibilityController } from './ui-visibility.controller';
import { UiVisibilityService } from './ui-visibility.service';

/**
 * @Global() KHÔNG cần thiết ở đây (khác `PermissionsModule`) - chỉ
 * `CustomersModule` cần `UiVisibilityService` để strip field lúc trả response
 * (xem `CustomersService.findAll()`/`findOne()`), import trực tiếp qua
 * `exports` bên dưới thay vì global, giữ đúng nguyên tắc module scope hẹp
 * nhất có thể.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UiVisibilityRule, RoleEntity, Department, Position])],
  controllers: [UiVisibilityController],
  providers: [UiVisibilityService],
  exports: [UiVisibilityService],
})
export class UiVisibilityModule {}
