import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Guide } from './guide.entity';
import { Position } from './position.entity';
import { BooleanTransformer } from '../transformers/boolean.transformer';

/** Guide hiển thị cho vị trí nào. Không có dòng = không giới hạn theo vị trí. */
@Entity('guide_positions')
export class GuidePosition {
  @PrimaryColumn({ name: 'guide_id', type: 'int' })
  guideId: number;

  @PrimaryColumn({ name: 'position_id', type: 'int' })
  positionId: number;

  /**
   * true = dòng LOẠI TRỪ (người thuộc mục này KHÔNG được xem, thắng "được xem"); false = dòng "được xem".
   * Khoá chính (guide, mục) nên 1 mục chỉ ở 1 trạng thái. Đọc qua `find({ where })`; QueryBuilder không chạy transformer -> truyền 1/0.
   */
  @Column({ name: 'is_excluded', type: 'tinyint', default: 0, transformer: new BooleanTransformer() })
  isExcluded: boolean;

  @ManyToOne(() => Guide, (g) => g.guidePositions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'guide_id' })
  guide: Guide;

  @ManyToOne(() => Position, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'position_id' })
  position: Position;
}
