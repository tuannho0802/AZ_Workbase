import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from '../../database/entities/user.entity';
import { RoleEntity } from '../../database/entities/role.entity';
import { DepartmentsModule } from '../departments/departments.module';

@Module({
  // RoleEntity: cần để UsersService validate role code có THẬT SỰ tồn tại
  // trong bảng `roles` không (create/update/approve user) - xem
  // `validateRoleExists()` trong users.service.ts. Đăng ký lại ở đây (dù
  // RolesModule cũng có forFeature([RoleEntity, ...]) riêng) là bình thường
  // với TypeORM - mỗi module tự có 1 scoped repository provider, không xung
  // đột (cùng pattern Department/User đã dùng ở DepartmentsModule/RolesModule).
  imports: [TypeOrmModule.forFeature([User, RoleEntity]), DepartmentsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule { }