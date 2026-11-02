import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Customer } from './customer.entity';
import { User } from './user.entity';
import { DecimalTransformer } from '../transformers/decimal.transformer';

/**
 * Phiếu RÚT tiền của khách hàng - bảng song song với `deposits` (nạp tiền).
 * Rút tiền KHÔNG làm đổi "Tổng nạp": 3 chỉ số Tổng nạp / Nạp thực / Đã rút được tính riêng (xem PLAN_WITHDRAWAL_LEAVE_EXPORT).
 * Không có cột legacy `created_by` như `deposits` - chỉ dùng `created_by_id` (nullable, FK users ON DELETE SET NULL).
 */
@Entity('withdrawals')
@Index('idx_withdrawals_customer_date', ['customerId', 'withdrawalDate'])
@Index('idx_withdrawals_date', ['withdrawalDate'])
export class Withdrawal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'customer_id', type: 'int' })
  customerId: number;

  @ManyToOne(() => Customer, customer => customer.withdrawals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  // ⚠️ BẮT BUỘC có DecimalTransformer - xem decimal.transformer.ts (mysql2 trả decimal dạng STRING).
  @Column({ type: 'decimal', precision: 15, scale: 2, transformer: new DecimalTransformer() })
  amount: number;

  @Column({ name: 'withdrawal_date', type: 'date' })
  withdrawalDate: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  broker: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'created_by_id', type: 'int', nullable: true })
  createdById: number | null;

  @ManyToOne(() => User, { nullable: true, eager: false, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
