import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { RolePermission } from './role-permission.entity';

/**
 * Permission - 1 quyền cụ thể mà code THẬT SỰ enforce (dạng "resource.action",
 * vd "customers.assign"). Admin KHÔNG tự thêm dòng mới vào bảng này qua UI
 * (khác hẳn RoleEntity) - bảng này chỉ mở rộng khi dev thêm 1 tính năng mới
 * có kiểm tra quyền tương ứng trong code, kèm migration seed thêm dòng.
 * Admin chỉ được BẬT/TẮT + chọn phạm vi (scope) cho từng permission trên
 * từng Role, không tạo permission mới tuỳ ý (tránh tạo ra quyền "ảo" không
 * ai enforce, gây hiểu nhầm nguy hiểm khi Admin tưởng đã khoá 1 chức năng).
 */
@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'key', length: 100, unique: true })
  key: string;

  @Column({ length: 50 })
  resource: string;

  @Column({ length: 50 })
  action: string;

  @Column({ name: 'supports_scope', default: true })
  supportsScope: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @OneToMany(() => RolePermission, (rp) => rp.permission)
  rolePermissions: RolePermission[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}