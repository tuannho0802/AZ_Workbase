import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { RoleEntity } from './role.entity';
import { Permission } from './permission.entity';

export enum PermissionScope {
  OWN = 'own',
  DEPARTMENT = 'department',
  ALL = 'all',
}

/**
 * RolePermission - MA TRẬN THẬT SỰ Admin chỉnh qua UI "Phân quyền": 1 dòng =
 * "Role X có Permission Y, với phạm vi (scope) Z".
 *
 * `scope`:
 *  - NULL nếu `permission.supportsScope=false` (quyền nhị phân thuần, vd
 *    "roles.manage" - không có khái niệm "chỉ phòng ban mình").
 *  - 'own' | 'department' | 'all' nếu có - quyết định `PermissionsService`
 *    trả về gì cho tầng service dùng để filter dữ liệu (thay thế hoàn toàn
 *    logic if/else cứng theo `Role` enum trước đây ở các AccessHelper).
 *
 * KHÔNG có dòng row cho 1 cặp (role, permission) = Role đó KHÔNG có quyền
 * này (thay vì phải thêm 1 cột `enabled: boolean` riêng) - đơn giản hoá
 * đúng 1 cách duy nhất để biểu diễn "không có quyền".
 */
@Entity('role_permissions')
export class RolePermission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'role_id' })
  roleId: number;

  @ManyToOne(() => RoleEntity, (role) => role.rolePermissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: RoleEntity;

  @Column({ name: 'permission_id' })
  permissionId: number;

  @ManyToOne(() => Permission, (permission) => permission.rolePermissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_id' })
  permission: Permission;

  @Column({ type: 'enum', enum: PermissionScope, nullable: true })
  scope: PermissionScope | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
