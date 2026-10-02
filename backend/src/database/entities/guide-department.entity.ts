import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Guide } from './guide.entity';
import { Department } from './department.entity';

/** Guide hiển thị cho phòng ban nào. Không có dòng = không giới hạn theo phòng ban. */
@Entity('guide_departments')
export class GuideDepartment {
  @PrimaryColumn({ name: 'guide_id', type: 'int' })
  guideId: number;

  @PrimaryColumn({ name: 'department_id', type: 'int' })
  departmentId: number;

  @ManyToOne(() => Guide, (g) => g.guideDepartments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'guide_id' })
  guide: Guide;

  @ManyToOne(() => Department, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'department_id' })
  department: Department;
}
