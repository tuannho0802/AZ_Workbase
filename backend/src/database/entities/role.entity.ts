import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { RolePermission } from './role-permission.entity';

/**
 * RoleEntity - đại diện cho 1 vai trò trong hệ thống, gồm 4 role hệ thống
 * (admin/manager/assistant/employee, `isSystem=true`, không xoá được, `code`
 * bất biến sau khi tạo) và các role TUỲ CHỈNH do Admin tự tạo qua UI
 * (`isSystem=false`) - xem migration `AddCustomRbacSystem` để hiểu đầy đủ
 * bối cảnh thiết kế.
 *
 * ⚠️ ĐẶT TÊN "RoleEntity" (không phải "Role") để KHÔNG đụng độ với enum
 * `Role` sẵn có ở `common/enums/role.enum.ts` (dùng ~15+ nơi trong code cũ
 * cho 4 role hệ thống, vd `@Roles(Role.ADMIN)`) - 2 khái niệm này SONG SONG
 * tồn tại có chủ đích (xem comment ở migration): enum `Role` cũ tiếp tục
 * dùng cho toàn bộ code hiện tại (backward-compatible), còn entity này phục
 * vụ tầng quản lý role MỚI (CRUD qua UI, gồm cả role tuỳ chỉnh ngoài enum).
 *
 * `code` là giá trị THẬT SỰ lưu trong cột `users.role` (có FOREIGN KEY tới
 * `roles.code`) - vì vậy `code` PHẢI bất biến sau khi tạo (không cho phép
 * sửa) để không làm "mồ côi" các user đã được gán role đó. Đây là điểm khác
 * biệt quan trọng so với `name` (tên hiển thị UI, sửa thoải mái).
 */
@Entity('roles')
export class RoleEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ name: 'is_system', default: false })
  isSystem: boolean;

  @OneToMany(() => RolePermission, (rp) => rp.role)
  rolePermissions: RolePermission[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}