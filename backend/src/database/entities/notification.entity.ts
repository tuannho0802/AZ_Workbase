import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import { NotificationBroadcast } from './notification-broadcast.entity';
import { BooleanTransformer } from '../transformers/boolean.transformer';

/**
 * Hộp thư thông báo - MỖI NGƯỜI NHẬN 1 DÒNG (fan-out on write), dùng chung cho
 * thông báo tự động (`category` customer/task) và thủ công (`category=manual`,
 * `broadcast_id` khác NULL). Xem PLAN_NOTIFICATION_SYSTEM.md mục 5.1.
 *
 * ⚠️ Cột thời gian dùng DATETIME(3) (KHÔNG dùng TIMESTAMP) và LUÔN được ghi từ
 * phía ứng dụng (JS `Date`) - không dựa `DEFAULT CURRENT_TIMESTAMP` của DB - để
 * vòng ghi/đọc đi qua CÙNG 1 cơ chế quy đổi múi giờ của mysql2, tránh lệch giờ
 * giữa session timezone của MySQL và timezone của Node (xem SKILL_DATABASE §Timezone).
 *
 * `read_at` là NGUỒN SỰ THẬT của trạng thái đọc (mọi truy vấn đếm/lọc chưa đọc dùng
 * `read_at IS NULL`). `is_read` là cột GHI ĐƯỢC (TINYINT, mặc định 0) phục vụ báo cáo/đọc
 * dữ liệu thủ công, được giữ đồng bộ bởi 1 nơi duy nhất trong service (`READ_PATCH`).
 *
 * ⚠️ VÌ SAO KHÔNG dùng cột sinh (GENERATED STORED)? Đã thử thật trên MySQL 8: TypeORM
 * 0.3 tra bảng `typeorm_metadata` khi gặp cột sinh mà entity không khai `asExpression`
 * → `migration:generate` của TOÀN DỰ ÁN bị crash (ER_NO_SUCH_TABLE); còn khai
 * `asExpression` thì mỗi lần generate lại sinh diff `CHANGE is_read` giả. Xem PLAN 11.13
 * (phương án thay thế "is_read ghi được").
 */
@Entity('notifications')
@Index('uk_recipient_coalesce', ['recipientId', 'coalesceKey'], {
  unique: true,
})
@Index('uk_recipient_dedupe', ['recipientId', 'dedupeKey'], { unique: true })
@Index('idx_recipient_unread', ['recipientId', 'readAt'])
@Index('idx_recipient_sort', ['recipientId', 'sortAt', 'id'])
@Index('idx_entity', ['entityType', 'entityId'])
@Index('idx_broadcast_read', ['broadcastId', 'readAt'])
export class Notification {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'recipient_id', type: 'int' })
  recipientId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'recipient_id',
    foreignKeyConstraintName: 'fk_notif_recipient',
  })
  recipient: User;

  /** NULL = hệ thống; thủ công = người gửi */
  @Column({ name: 'actor_id', type: 'int', nullable: true })
  actorId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id', foreignKeyConstraintName: 'fk_notif_actor' })
  actor: User | null;

  @Column({ name: 'event_type', type: 'varchar', length: 60 })
  eventType: string;

  /** 'customer' | 'task' | 'manual' */
  @Column({ type: 'varchar', length: 20 })
  category: string;

  @Column({ type: 'varchar', length: 40 })
  relation: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 30, nullable: true })
  entityType: string | null;

  @Column({ name: 'entity_id', type: 'int', nullable: true })
  entityId: number | null;

  @Column({
    name: 'sub_entity_type',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  subEntityType: string | null;

  @Column({ name: 'sub_entity_id', type: 'int', nullable: true })
  subEntityId: number | null;

  @Column({ name: 'broadcast_id', type: 'int', unsigned: true, nullable: true })
  broadcastId: number | null;

  @ManyToOne(() => NotificationBroadcast, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'broadcast_id',
    foreignKeyConstraintName: 'fk_notif_broadcast',
  })
  broadcast: NotificationBroadcast | null;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  /** Thủ công: NULL - nội dung đầy đủ nằm ở notification_broadcasts.body */
  @Column({ type: 'varchar', length: 500, nullable: true })
  body: string | null;

  @Column({ type: 'json', nullable: true })
  params: Record<string, unknown> | null;

  @Column({ type: 'int', default: 1 })
  occurrences: number;

  /** Chỉ có giá trị khi CHƯA ĐỌC (đọc xong set NULL). Thủ công luôn NULL. */
  @Column({
    name: 'coalesce_key',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  coalesceKey: string | null;

  @Column({ name: 'dedupe_key', type: 'varchar', length: 120, nullable: true })
  dedupeKey: string | null;

  /** NGUỒN SỰ THẬT của trạng thái đọc */
  @Column({ name: 'read_at', type: 'datetime', precision: 3, nullable: true })
  readAt: Date | null;

  @Column({
    name: 'is_read',
    type: 'tinyint',
    default: 0,
    transformer: new BooleanTransformer(),
  })
  isRead: boolean;

  /** Người nhận ẩn khỏi hộp thư (chỉ thủ công) - KHÔNG ảnh hưởng is_read */
  @Column({
    name: 'dismissed_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  dismissedAt: Date | null;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;

  @Column({ name: 'sort_at', type: 'datetime', precision: 3 })
  sortAt: Date;
}
