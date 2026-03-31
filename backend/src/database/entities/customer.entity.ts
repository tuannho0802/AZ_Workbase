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

  @Column({ name: 'sales_user_id' })
  salesUserId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sales_user_id' })
  salesUser: User;

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

  @Column({ name: 'department_id' })
  departmentId: number;

  @ManyToOne(() => Department)
  @JoinColumn({ name: 'department_id' })
  department: Department;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ name: 'created_by' })
  createdBy: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdByUser: User;

  @Column({ name: 'updated_by', nullable: true })
  updatedBy: number;

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
