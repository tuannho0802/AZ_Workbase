import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { AssignmentGroupConfigDepartment } from './assignment-group-config-department.entity';
import { AssignmentGroupConfigPosition } from './assignment-group-config-position.entity';

/**
 * AssignmentGroupConfig ("Quản lý phụ trách") - thay thế cơ chế FE hardcode
 * dò tên phòng ban (vd `.includes('kinh doanh')` ở customers/page.tsx) bằng
 * 1 bảng điều khiển Admin tự cấu hình qua UI: "nhóm phụ trách X gồm N Phòng
 * ban (BẮT BUỘC >=1) + N Vị trí (TUỲ CHỌN)".
 *
 * `key` bất biến sau khi tạo - dùng làm định danh code tham chiếu (vd FE gọi
 * GET /assignment-groups/sales/users). 2 config hệ thống mặc định: 'sales',
 * 'marketing' (seed kèm migration, is_system=true, không xoá được) - tái tạo
 * ĐÚNG hành vi hardcode cũ ngày đầu, Admin có thể sửa lại danh sách phòng
 * ban/vị trí sau khi seed mà không cần deploy lại code.
 */
@Entity('assignment_group_configs')
export class AssignmentGroupConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, unique: true })
  key: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ name: 'is_system', default: false })
  isSystem: boolean;

  // Mã màu hex hiển thị Tag ngoài FE (vd '#1890ff') - xem migration
  // AddColorToRbacGroupingTables1781300000000. NOT NULL DEFAULT '#1890ff'.
  @Column({ type: 'varchar', length: 20, default: '#1890ff' })
  color: string;

  @OneToMany(() => AssignmentGroupConfigDepartment, (d) => d.config)
  departments: AssignmentGroupConfigDepartment[];

  @OneToMany(() => AssignmentGroupConfigPosition, (p) => p.config)
  positions: AssignmentGroupConfigPosition[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}