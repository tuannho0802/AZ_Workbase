import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';
import { User } from './user.entity';

export enum LeaveType {
  ANNUAL = 'annual',         // Phép năm
  SICK = 'sick',            // Nghỉ ốm
  MATERNITY = 'maternity',  // Thai sản
  UNPAID = 'unpaid',        // Không lương
  COMPENSATORY = 'compensatory' // Nghỉ bù
}

export enum LeaveStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled'
}

export enum LeaveDuration {
  FULL_DAY = 'full_day',
  HALF_DAY_AM = 'half_day_am',  // Sáng
  HALF_DAY_PM = 'half_day_pm'   // Chiều
}

@Entity('leave_requests')
export class LeaveRequest {
  @PrimaryGeneratedColumn()
  id: number;
  
  // WHO
  @Column({ name: 'requester_id', type: 'int', comment: 'Người xin nghỉ' })
  requesterId: number;
  
  @Column({ 
    name: 'approver_id',
    type: 'int', 
    nullable: true,
    comment: 'Người duyệt (Manager/Admin)' 
  })
  approverId: number | null;
  
  // WHAT
  @Column({ 
    name: 'leave_type',
    type: 'enum', 
    enum: LeaveType,
    comment: 'Loại nghỉ phép' 
  })
  leaveType: LeaveType;
  
  @Column({ 
    type: 'enum', 
    enum: LeaveDuration,
    default: LeaveDuration.FULL_DAY,
    comment: 'Thời lượng nghỉ trong ngày' 
  })
  duration: LeaveDuration;
  
  // WHEN
  @Column({ 
    name: 'start_date',
    type: 'date',
    comment: 'Ngày bắt đầu nghỉ' 
  })
  startDate: Date;
  
  @Column({ 
    name: 'end_date',
    type: 'date',
    comment: 'Ngày kết thúc nghỉ' 
  })
  endDate: Date;
  
  @Column({ 
    name: 'total_days',
    type: 'decimal', 
    precision: 4, 
    scale: 1,
    comment: 'Tổng số ngày nghỉ (tính cả 0.5 cho half day)' 
  })
  totalDays: number;
  
  // WHY
  @Column({ 
    type: 'text',
    comment: 'Lý do xin nghỉ' 
  })
  reason: string;
  
  @Column({ 
    name: 'rejection_reason',
    type: 'text', 
    nullable: true,
    comment: 'Lý do từ chối (nếu rejected)' 
  })
  rejectionReason: string | null;
  
  // STATUS
  @Column({ 
    type: 'enum', 
    enum: LeaveStatus,
    default: LeaveStatus.PENDING,
    comment: 'Trạng thái đơn' 
  })
  status: LeaveStatus;
  
  // ATTACHMENT (Optional)
  @Column({ 
    name: 'attachment_url',
    type: 'varchar', 
    length: 500, 
    nullable: true,
    comment: 'Link file đính kèm (giấy bác sĩ, v.v.)' 
  })
  attachmentUrl: string | null;
  
  // TIMESTAMPS
  @CreateDateColumn({ name: 'created_at', comment: 'Ngày tạo đơn' })
  createdAt: Date;
  
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
  
  @Column({ 
    name: 'approved_at',
    type: 'datetime', 
    nullable: true,
    comment: 'Thời điểm duyệt' 
  })
  approvedAt: Date | null;
  
  @Column({ 
    name: 'rejected_at',
    type: 'datetime', 
    nullable: true,
    comment: 'Thời điểm từ chối' 
  })
  rejectedAt: Date | null;
  
  @Column({ 
    name: 'cancelled_at',
    type: 'datetime', 
    nullable: true,
    comment: 'Thời điểm hủy (bởi user)' 
  })
  cancelledAt: Date | null;
  
  // RELATIONS
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requester_id' })
  requester: User;
  
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approver_id' })
  approver: User | null;
}
