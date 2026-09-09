import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { LeaveRequest } from './leave-request.entity';

/**
 * 1 ảnh đính kèm của 1 đơn nghỉ phép (giấy khám bệnh...). Tối đa
 * `upload_leave_attachment_max_count` dòng / `leaveRequestId` (giá trị lấy
 * từ bảng `settings`, enforce ở `LeaveRequestsService`, KHÔNG constraint
 * cứng ở DB vì con số này Admin có thể đổi qua UI).
 *
 * `objectKey`: OBJECT KEY trên Backblaze B2 (bucket
 * `az-imgs-leave-request-workbase`, Private) - KHÔNG phải URL. Dữ liệu sức
 * khoẻ nhạy cảm - chỉ lộ ra ngoài qua Presigned GET TTL ngắn (10 phút), ký
 * on-demand sau khi kiểm tra quyền xem đơn - xem
 * `LeaveRequestsService.getAttachmentViewUrls()`.
 */
@Entity('leave_request_attachments')
export class LeaveRequestAttachment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'leave_request_id' })
  leaveRequestId: number;

  @ManyToOne(() => LeaveRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leave_request_id' })
  leaveRequest: LeaveRequest;

  @Column({ name: 'object_key', type: 'varchar', length: 500 })
  objectKey: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
