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

import { Role } from '../../common/enums/role.enum';
import { Department } from './department.entity';
import { ManagedLink } from '../../common/types/managed-link.type';

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

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

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

  // ⚠️ select: false: giống pattern của `password` ở trên — dữ liệu này
  // (danh sách link Fanpage/Group mà user quản lý) chỉ Admin được xem/sửa
  // (yêu cầu nghiệp vụ "Only Admin CRUD"). Nếu không có select: false, các
  // query dùng cho mọi role (vd findEmployees() phục vụ dropdown chọn Sales
  // trong form khách hàng, hay findAll()) sẽ vô tình trả kèm profile ra
  // ngoài cho cả non-admin. Muốn đọc phải chủ động
  // .addSelect('user.profile') ở đúng những chỗ đã xác nhận caller là Admin
  // (xem UsersService.getProfile/updateProfile).
  @Column({ type: 'json', nullable: true, select: false })
  profile: ManagedLink[] | null;

  @Column({
    name: 'is_active',
    default: true,
    transformer: new BooleanTransformer(),
  })
  isActive: boolean;

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
