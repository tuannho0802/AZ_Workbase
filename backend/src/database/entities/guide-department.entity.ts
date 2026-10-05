import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Guide } from './guide.entity';
import { Department } from './department.entity';
import { BooleanTransformer } from '../transformers/boolean.transformer';

/** Guide hiển thị cho phòng ban nào. Không có dòng = không giới hạn theo phòng ban. */
@Entity('guide_departments')
export class GuideDepartment {
  @PrimaryColumn({ name: 'guide_id', type: 'int' })
  guideId: number;

  @PrimaryColumn({ name: 'department_id', type: 'int' })
  departmentId: number;

  /**
   * true = dòng LOẠI TRỪ (người thuộc mục này KHÔNG được xem, thắng "được xem"); false = dòng "được xem".
   * Khoá chính (guide, mục) nên 1 mục chỉ ở 1 trạng thái. Đọc qua `find({ where })`; QueryBuilder không chạy transformer -> truyền 1/0.
   */
  @Column({ name: 'is_excluded', type: 'tinyint', default: 0, transformer: new BooleanTransformer() })
  isExcluded: boolean;

  @ManyToOne(() => Guide, (g) => g.guideDepartments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'guide_id' })
  guide: Guide;

  @ManyToOne(() => Department, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'department_id' })
  department: Department;
}
