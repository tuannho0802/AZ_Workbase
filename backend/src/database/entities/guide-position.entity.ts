import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Guide } from './guide.entity';
import { Position } from './position.entity';

/** Guide hiển thị cho vị trí nào. Không có dòng = không giới hạn theo vị trí. */
@Entity('guide_positions')
export class GuidePosition {
  @PrimaryColumn({ name: 'guide_id', type: 'int' })
  guideId: number;

  @PrimaryColumn({ name: 'position_id', type: 'int' })
  positionId: number;

  @ManyToOne(() => Guide, (g) => g.guidePositions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'guide_id' })
  guide: Guide;

  @ManyToOne(() => Position, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'position_id' })
  position: Position;
}
