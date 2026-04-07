import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { Department } from './department.entity';
import { Deposit } from './deposit.entity';
import { CustomerNote } from './customer-note.entity';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 20, unique: true })
  phone: string;

  @Column({ length: 255, nullable: true })
  email: string;

  @Column({
    type: 'enum',
    enum: ['Facebook', 'TikTok', 'Google', 'Instagram', 'LinkedIn', 'Other'],
  })
  source: string;

  @Column({ length: 100, nullable: true })
  campaign: string;

  @Column({ name: 'sales_user_id', nullable: true, default: null })
  salesUserId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sales_user_id' })
  salesUser: User | null;

  @Column({
    type: 'enum',
    enum: ['closed', 'pending', 'potential', 'lost', 'inactive'],
    default: 'pending',
  })
  status: string;

  @Column({ length: 100, nullable: true })
  broker: string;

  @Column({ name: 'closed_date', type: 'date', nullable: true })
  closedDate: Date;

  @Column({ name: 'department_id', nullable: true, default: null })
  departmentId: number | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department: Department | null;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ name: 'created_by' })
  createdBy_OLD: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdByUser_OLD: User;

  @Column({ name: 'updated_by', nullable: true })
  updatedBy_OLD: number;

  // New Audit Trail Fields
  @Column({ name: 'created_by_id', nullable: true })
  createdById: number;

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @Column({ name: 'updated_by_id', nullable: true })
  updatedById: number;

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'updated_by_id' })
  updatedBy: User;

  @Column({ name: 'input_date', type: 'date' })
  inputDate: Date;

  @Column({ name: 'assigned_date', type: 'date', nullable: true })
  assignedDate: Date | null;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Deposit, deposit => deposit.customer)
  deposits: Deposit[];

  @OneToMany(() => CustomerNote, note => note.customer)
  notes: CustomerNote[];
}
