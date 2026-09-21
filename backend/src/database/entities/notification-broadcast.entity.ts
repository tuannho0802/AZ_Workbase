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
}
