import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { BooleanTransformer } from '../transformers/boolean.transformer';

import { Customer } from './customer.entity';

@Entity('departments')
export class Department {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'manager_user_id', nullable: true })
  managerUserId: number;

  @Column({ name: 'is_active', default: true, transformer: new BooleanTransformer() })
  isActive: boolean;

  // Mã màu hex hiển thị Tag ngoài FE (vd '#1890ff') - xem migration
  // AddColorToRbacGroupingTables1781300000000. NOT NULL DEFAULT '#1890ff'.
  @Column({ type: 'varchar', length: 20, default: '#1890ff' })
  color: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Customer, customer => customer.department)
  customers: Customer[];
}