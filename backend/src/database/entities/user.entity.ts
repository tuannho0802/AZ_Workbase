import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BooleanTransformer } from '../transformers/boolean.transformer';

import { Role } from '../../common/enums/role.enum';
import { Department } from './department.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  password?: string;

  @Column()
  name: string;

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

  @Column({ name: 'is_active', default: true, transformer: new BooleanTransformer() })
  isActive: boolean;


  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt: Date;

  @Column({ name: 'hashed_refresh_token', type: 'text', nullable: true, select: false })
  hashedRefreshToken: string | null;

  @Column({ 
    name: 'annual_leave_balance',
    type: 'decimal', 
    precision: 4, 
    scale: 1,
    default: 12.0,
    comment: 'Số ngày phép năm còn lại' 
  })
  annualLeaveBalance: number;
  
  @Column({ 
    name: 'annual_leave_total',
    type: 'decimal', 
    precision: 4, 
    scale: 1,
    default: 12.0,
    comment: 'Tổng ngày phép năm ban đầu' 
  })
  annualLeaveTotal: number;
  
  @Column({ 
    name: 'compensatory_leave_balance',
    type: 'decimal', 
    precision: 4, 
    scale: 1,
    default: 0,
    comment: 'Số ngày nghỉ bù tích lũy' 
  })
  compensatoryLeaveBalance: number;
  
  @Column({ 
    name: 'leave_year',
    type: 'int',
    default: 2026,
    comment: 'Năm áp dụng quỹ phép hiện tại' 
  })
  leaveYear: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
