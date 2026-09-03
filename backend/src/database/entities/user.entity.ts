import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BooleanTransformer } from '../transformers/boolean.transformer';
import { DecimalTransformer } from '../transformers/decimal.transformer';

import { Role } from '../../common/enums/role.enum';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';
import { Department } from './department.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  // ⚠️ select: false: không bao giờ trả password (kể cả hash) trong các query
  // mặc định / relations join (vd: customer.createdBy, customer.salesUser...).
  // Trước đây thiếu dòng này khiến password hash bị lộ ra API mỗi lần load
  // danh sách khách hàng. Nơi nào cần đọc password (chỉ có login) phải chủ
  // động .addSelect('user.password') qua query builder - xem UsersService.findByEmail().
  @Column({ select: false })
  password?: string;

  @Column()
  name: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  phone: string | null;

  // ⚠️ Cột `profile` (JSON thủ công lưu URL Fanpage/Group) ĐÃ BỊ XOÁ - xem
  // migration 1778100000000-DropUserProfileColumn.ts. Thay thế bằng dữ liệu
  // TÍNH TOÁN ĐỘNG từ `LinkGroup.primaryManagerId` (Quản lý chính) +
  // `LinkGroupSecondaryManager` (Quản lý phụ) - không cần cột riêng trên
  // User nữa, tránh trùng lặp dữ liệu. Xem
  // `LinkGroupManagersService.listManagedByMe()` để lấy danh sách nhóm 1
  // user đang quản lý (chính hoặc phụ).

  @Column({
    name: 'zk_device_user_id',
    type: 'varchar',
    length: 50,
    nullable: true,
    comment:
      'Mã "User ID" trên máy chấm công (khác uid nội bộ của máy) - dùng để map log chấm công về đúng nhân viên',
  })
  zkDeviceUserId: string | null;

  @Column({
    type: 'enum',
    enum: Role,
    default: Role.EMPLOYEE,
  })
  role: string;

  @Column({ name: 'department_id', nullable: true })
  departmentId: number;

  @ManyToOne(() => Department)
  @JoinColumn({ name: 'department_id' })
  department: Department;

  @Column({
    name: 'is_active',
    default: true,
    transformer: new BooleanTransformer(),
  })
  isActive: boolean;

  /**
   * Trạng thái duyệt tài khoản - chỉ có ý nghĩa với tài khoản tạo qua
   * POST /auth/register (tự đăng ký công khai). Tài khoản Admin tạo qua
   * "Thêm nhân viên" mặc định 'approved' luôn (xem UsersService.create),
   * không cần qua bước chờ.
   */
  @Column({
    name: 'approval_status',
    type: 'enum',
    enum: ApprovalStatus,
    default: ApprovalStatus.APPROVED,
  })
  approvalStatus: ApprovalStatus;

  @Column({ name: 'approved_by_id', nullable: true })
  approvedById: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by_id' })
  approvedBy: User | null;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'rejection_reason', type: 'varchar', length: 255, nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt: Date;

  @Column({
    name: 'hashed_refresh_token',
    type: 'text',
    nullable: true,
    select: false,
  })
  hashedRefreshToken: string | null;

  @Column({
    name: 'annual_leave_balance',
    type: 'decimal',
    precision: 4,
    scale: 1,
    default: 12.0,
    comment: 'Số ngày phép năm còn lại',
    // ⚠️ BẮT BUỘC có transformer này - xem giải thích chi tiết ở
    // decimal-column.transformer.ts. Thiếu nó, giá trị đọc từ DB là STRING
    // ("12.0") dù type khai TS là number - đã từng gây lỗi 400 khi export
    // Excel ("annualLeaveBalance must be a number").
    transformer: new DecimalTransformer(),
  })
  annualLeaveBalance: number;

  @Column({
    name: 'annual_leave_total',
    type: 'decimal',
    precision: 4,
    scale: 1,
    default: 12.0,
    comment: 'Tổng ngày phép năm ban đầu',
  })
  annualLeaveTotal: number;

  @Column({
    name: 'compensatory_leave_balance',
    type: 'decimal',
    precision: 4,
    scale: 1,
    default: 0,
    comment: 'Số ngày nghỉ bù tích lũy',
  })
  compensatoryLeaveBalance: number;

  @Column({
    name: 'leave_year',
    type: 'int',
    default: 2026,
    comment: 'Năm áp dụng quỹ phép hiện tại',
  })
  leaveYear: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}