import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Guide } from './guide.entity';
import { RoleEntity } from './role.entity';
import { BooleanTransformer } from '../transformers/boolean.transformer';

/** Guide hiển thị cho role nào (dùng `roles` động, không hardcode tên role). Không có dòng = mọi role. */
@Entity('guide_roles')
export class GuideRole {
  @PrimaryColumn({ name: 'guide_id', type: 'int' })
  guideId: number;

  @PrimaryColumn({ name: 'role_id', type: 'int' })
  roleId: number;

  /**
   * true = dòng LOẠI TRỪ (người thuộc mục này KHÔNG được xem, thắng "được xem"); false = dòng "được xem".
   * Khoá chính (guide, mục) nên 1 mục chỉ ở 1 trạng thái. Đọc qua `find({ where })`; QueryBuilder không chạy transformer -> truyền 1/0.
   */
  @Column({ name: 'is_excluded', type: 'tinyint', default: 0, transformer: new BooleanTransformer() })
  isExcluded: boolean;

  @ManyToOne(() => Guide, (g) => g.guideRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'guide_id' })
  guide: Guide;

  @ManyToOne(() => RoleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: RoleEntity;
}
