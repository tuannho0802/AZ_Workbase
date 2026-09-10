import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { RoleEntity } from './role.entity';
import { Department } from './department.entity';
import { Position } from './position.entity';

/**
 * UiVisibilityRule - TRỤC PHÂN QUYỀN HOÀN TOÀN KHÁC với `RolePermission`.
 *
 * ⚠️ ĐỌC KỸ TRƯỚC KHI SỬA - đây KHÔNG phải "action permission" (không quyết
 * định Role có được LÀM gì không). Bảng này chỉ quyết định "Role/Phòng ban/
 * Vị trí này có được THẤY 1 field/tab cụ thể hay không" - dùng để ẩn bớt dữ
 * liệu (vd Content không thấy "Sales phụ trách") mà KHÔNG cần đụng tới
 * `role_permissions`.
 *
 * DEFAULT NGƯỢC với `RolePermission`: không có dòng nào cho 1
 * (role, resource, elementKey) = MẶC ĐỊNH HIỆN (visible=true) - vì hầu hết
 * Role/Position không cần ẩn gì cả, chỉ những trường hợp đặc biệt mới cần 1
 * dòng tường minh `visible=false`. Nếu đảo default này thành "ẩn hết khi
 * không có dòng" sẽ làm biến mất toàn bộ field/tab của MỌI role ngay khi
 * bảng này còn trống - đây là bug nghiêm trọng, KHÔNG được phép.
 *
 * Thứ tự ưu tiên override GIỐNG HỆT `RolePermission` (xem entity đó):
 * Position override -> Department override -> Global. 1 dòng chỉ được set
 * `departmentId` HOẶC `positionId`, không set cả hai (không phải ma trận tổ
 * hợp Phòng ban x Vị trí - xem PLAN mục 2.2).
 */
@Entity('ui_visibility_rules')
export class UiVisibilityRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'role_id' })
  roleId: number;

  @ManyToOne(() => RoleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: RoleEntity;

  @Column({ name: 'department_id', nullable: true })
  departmentId: number | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'department_id' })
  department: Department | null;

  @Column({ name: 'position_id', nullable: true })
  positionId: number | null;

  @ManyToOne(() => Position, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'position_id' })
  position: Position | null;

  // Resource cố định trong code (vd 'customers') - cho phép mở rộng sang
  // resource khác trong tương lai mà không cần đổi schema.
  @Column({ length: 50 })
  resource: string;

  // Khoá dạng 'field:xxx' hoặc 'tab:xxx' - danh mục CỐ ĐỊNH trong code
  // (xem CUSTOMER_VISIBILITY_ELEMENTS trong ui-visibility.constants.ts),
  // KHÔNG cho phép Admin tự nhập tuỳ ý qua UI.
  @Column({ name: 'element_key', length: 100 })
  elementKey: string;

  @Column({ type: 'boolean' })
  visible: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
