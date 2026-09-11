import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';
import { User } from './user.entity';
import { DecimalTransformer } from '../transformers/decimal.transformer';
import { LeaveRequestAttachment } from './leave-request-attachment.entity';

// ⚠️ [DEPRECATED] Enum này KHÔNG còn là nguồn sự thật cho loại phép kể từ
// migration `CreateLeaveTypes1781500000000` - cột `leave_requests.leave_type`
// giờ là VARCHAR tự do, tham chiếu `leave_types.code` (bảng do Admin/Assistant
// tự CRUD qua module `leave-types`, mirror `customer_statuses`). Giữ lại enum
// này CHỈ để không vỡ code cũ còn tham chiếu (vd giá trị mặc định trong test),
// KHÔNG dùng để validate/so sánh nghiệp vụ nữa (xem `LeaveTypesService`,
// `LeaveRequestsService.create()`/`approve()` đọc động từ DB thay vì so sánh
// enum). 5 giá trị dưới đây trùng đúng 5 `code` đã seed sẵn (is_system=true)
// trong `leave_types`, cộng thêm 2 code mới `meet_client`/`late_arrival`
// KHÔNG có trong enum (loại phép mới, không cần enum TS vì không còn nơi nào
// so sánh cứng theo enum).
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
  // ⚠️ VARCHAR tự do (không còn ENUM cứng kể từ `CreateLeaveTypes1781500000000`)
  // - giá trị THẬT tham chiếu `leave_types.code`, validate ở
  // `LeaveTypesService`/`LeaveRequestsService.create()`, KHÔNG phải ở tầng DB.
  @Column({
    name: 'leave_type',
    type: 'varchar',
    length: 50,
    comment: 'Mã loại nghỉ phép - tham chiếu leave_types.code',
  })
  leaveType: string;
  
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
    comment: 'Tổng số ngày nghỉ (tính cả 0.5 cho half day)',
    // ⚠️ BẮT BUỘC - xem decimal.transformer.ts. Thiếu nó, giá trị đọc từ DB
    // là STRING dù type khai TS là number.
    transformer: new DecimalTransformer(),
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
  
  // ATTACHMENT (Optional) - ⚠️ CỘT CŨ, giữ lại để không vỡ dữ liệu cũ nếu
  // đã có bản ghi dùng field này, nhưng luồng upload MỚI (nhiều ảnh, xem
  // migration CreateLeaveRequestAttachments) dùng bảng con `attachments`
  // bên dưới - KHÔNG ghi tiếp vào cột này nữa.
  @Column({ 
    name: 'attachment_url',
    type: 'varchar', 
    length: 500, 
    nullable: true,
    comment: '[DEPRECATED] Dùng bảng leave_request_attachments thay thế - giữ cột này chỉ để tương thích ngược' 
  })
  attachmentUrl: string | null;

  // Danh sách ảnh đính kèm (tối đa upload_leave_attachment_max_count, xem
  // settings) - mỗi phần tử lưu OBJECT KEY trên B2, phải ký lại Presigned
  // GET on-demand, KHÔNG trả trực tiếp trong response mặc định.
  @OneToMany(() => LeaveRequestAttachment, (a) => a.leaveRequest)
  attachments: LeaveRequestAttachment[];
  
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