import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Bảng cha của Thông báo THỦ CÔNG (1 dòng / 1 lần gửi) - giữ nội dung đúng 1
 * lần, tránh nhân bản văn bản dài × N người nhận. Từng người nhận là 1 dòng
 * ở `notifications` (fan-out on write, `broadcast_id` trỏ về đây).
 *
 * Phase 1 CHỈ tạo entity + bảng; logic gửi/theo dõi nằm ở Phase M1.
 * Không khai `@OneToMany` ngược sang `Notification` (theo PLAN mục 5.1).
 */
@Entity('notification_broadcasts')
@Index('idx_sender_created', ['senderId', 'createdAt'])
@Index('idx_created', ['createdAt'])
export class NotificationBroadcast {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'sender_id', type: 'int', nullable: true })
  senderId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'sender_id',
    foreignKeyConstraintName: 'fk_broadcast_sender',
  })
  sender: User | null;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  /** 'USERS' | 'DEPARTMENTS' | 'ALL' */
  @Column({ name: 'audience_type', type: 'varchar', length: 20 })
  audienceType: string;

  @Column({ name: 'audience_params', type: 'json', nullable: true })
  audienceParams: Record<string, unknown> | null;

  @Column({ name: 'entity_type', type: 'varchar', length: 30, nullable: true })
  entityType: string | null;

  @Column({ name: 'entity_id', type: 'int', nullable: true })
  entityId: number | null;

  @Column({ name: 'recipient_count', type: 'int', default: 0 })
  recipientCount: number;

  @Column({
    name: 'created_at',
    type: 'datetime',
    precision: 3,
    default: () => 'CURRENT_TIMESTAMP(3)',
  })
  createdAt: Date;

  /**
   * [M1 - CRUD đầy đủ] NULL = chưa từng sửa. Set khi người gửi (hoặc Admin
   * theo scope `notification_broadcasts.edit`) sửa `title`/`body` sau khi đã
   * gửi. FE dùng cột này để hiện nhãn "Đã chỉnh sửa" ở cả trang "Thông báo đã
   * gửi" lẫn modal chi tiết phía người nhận (title được đồng bộ lại vào từng
   * dòng `notifications.title`, `body` luôn đọc qua JOIN nên không cần đồng bộ).
   */
  @Column({
    name: 'updated_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  updatedAt: Date | null;

  /**
   * [M1 - CRUD đầy đủ] Soft-delete CHO BẢN GHI GỐC (giữ lại lịch sử/đối chiếu
   * audit "đã từng gửi gì, tới bao nhiêu người, ai xoá") - KHÔNG áp dụng quy
   * tắc "no hard delete" này cho các dòng `notifications` fan-out của lần gửi
   * này: khi xoá, service XOÁ HẲN toàn bộ dòng đó khỏi hộp thư mọi người nhận
   * (đúng yêu cầu "xoá thì mất thông báo luôn" - khác với người nhận tự ẩn
   * (`dismissed_at`) chỉ ẩn ở hộp thư của riêng họ). `deleted_at != NULL` ->
   * loại khỏi danh sách "Thông báo đã gửi" và chặn edit/xem chi tiết thêm.
   */
  @Column({
    name: 'deleted_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  deletedAt: Date | null;
}