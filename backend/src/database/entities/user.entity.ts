import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BooleanTransformer } from '../transformers/boolean.transformer';

import { Role } from '../../common/enums/role.enum';
import { Department } from './department.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  password?: string;

  @Column()
  name: string;

  @Column({
    type: 'enum',
    enum: Role,
    default: Role.EMPLOYEE,
  })
  role: string;

  @Column({ name: 'department_id', nullable: true })
  departmentId: number;

  @ManyToOne(() => Department)
  @JoinColumn({ name: 'department_id' })
  department: Department;

  @Column({ name: 'is_active', default: true, transformer: new BooleanTransformer() })
  isActive: boolean;


  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt: Date;

  @Column({ name: 'hashed_refresh_token', type: 'text', nullable: true, select: false })
  hashedRefreshToken: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
