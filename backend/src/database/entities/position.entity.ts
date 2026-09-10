import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Department } from './department.entity';

/**
 * Position (Vị trí) - lớp phân quyền chi tiết hơn Role, đặt DƯỚI Role
 * (vd Role `employee` + Position `content`, `editor`, `media`...).
 *
 * ⚠️ `departmentId` ở đây CHỈ mang tính TỔ CHỨC/GỢI Ý (hiển thị nhóm Position
 * theo phòng ban cho dễ nhìn trong UI quản lý) - KHÔNG dùng để ràng buộc
 * "user thuộc phòng ban A chỉ được chọn Position có departmentId=A". User có
 * thể chọn BẤT KỲ Position nào bất kể phòng ban của họ (đúng yêu cầu nghiệp
 * vụ "Position phụ thuộc phòng ban nhiều hơn, KHÔNG BẮT BUỘC" - xem ví dụ
 * Admin/HR, Admin/IT, Admin/Director, Admin/CEO trong PLAN).
 *
 * `code` bất biến sau khi tạo (giống `RoleEntity.code`) vì `role_permissions`
 * và các bảng override khác tham chiếu tới Position qua khoá ngoại `id`, còn
 * `code` chỉ dùng làm định danh dễ đọc/log, KHÔNG phải khoá tham chiếu nghiệp
 * vụ - vẫn giữ bất biến để nhất quán & tránh nhầm lẫn khi audit.
 */
@Entity('positions')
export class Position {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 100 })
  name: string;

  @Column({ name: 'department_id', nullable: true })
  departmentId: number | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department: Department | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ name: 'is_system', default: false })
  isSystem: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
