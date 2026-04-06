  import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Customer } from './customer.entity';
import { User } from './user.entity';

@Entity('deposits')
export class Deposit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'customer_id' })
  customerId: number;

  @ManyToOne(() => Customer, customer => customer.deposits, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ name: 'deposit_date', type: 'date' })
  depositDate: Date;

  @Column({ length: 100, nullable: true })
  broker: string;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ name: 'created_by' })
  createdBy_OLD: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdByUser_OLD: User;

  // New Audit Trail Fields
  @Column({ name: 'created_by_id', nullable: true })
  createdById: number;

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
