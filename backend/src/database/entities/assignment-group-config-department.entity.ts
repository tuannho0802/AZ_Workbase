import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { AssignmentGroupConfig } from './assignment-group-config.entity';
import { Department } from './department.entity';

/**
 * Danh sách Phòng ban (N+1, BẮT BUỘC >=1 dòng để config có hiệu lực) thuộc
 * 1 AssignmentGroupConfig - xem giải thích đầy đủ ở entity đó.
 */
@Entity('assignment_group_config_departments')
@Unique('uk_config_dept', ['configId', 'departmentId'])
export class AssignmentGroupConfigDepartment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'config_id' })
  configId: number;

  @ManyToOne(() => AssignmentGroupConfig, (c) => c.departments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'config_id' })
  config: AssignmentGroupConfig;

  @Column({ name: 'department_id' })
  departmentId: number;

  @ManyToOne(() => Department, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'department_id' })
  department: Department;
}
