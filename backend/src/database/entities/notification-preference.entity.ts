import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';
import { BooleanTransformer } from '../transformers/boolean.transformer';

/**
 * Tuỳ chọn thông báo cá nhân (mô hình OPT-OUT): chỉ có dòng khi người dùng
 * KHÁC mặc định. Event `mandatory` bỏ qua cấu hình tắt (xem event-catalog.ts).
 * Phase 1 chỉ ĐỌC bảng này trong `emit()`; endpoint GET/PUT + UI ở Phase 6.
 */
@Entity('notification_preferences')
export class NotificationPreference {
  @PrimaryColumn({ name: 'user_id', type: 'int' })
  userId: number;

  @PrimaryColumn({ name: 'event_type', type: 'varchar', length: 60 })
  eventType: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_notifpref_user',
  })
  user: User;

  @Column({ type: 'tinyint', transformer: new BooleanTransformer() })
  enabled: boolean;

  @Column({
    name: 'updated_at',
    type: 'datetime',
    precision: 3,
    default: () => 'CURRENT_TIMESTAMP(3)',
  })
  updatedAt: Date;
}
