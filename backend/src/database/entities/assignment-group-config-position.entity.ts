import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { AssignmentGroupConfig } from './assignment-group-config.entity';
import { Position } from './position.entity';

/**
 * Danh sách Vị trí (N, TUỲ CHỌN) thuộc 1 AssignmentGroupConfig - nếu config
 * KHÔNG có dòng nào ở đây, `AssignmentGroupsService.resolveUsers()` KHÔNG
 * lọc thêm theo vị trí (chỉ cần đúng phòng ban là đủ). Nếu có >=1 dòng, user
 * phải có `position_id` nằm trong danh sách này MỚI hợp lệ.
 */
@Entity('assignment_group_config_positions')
@Unique('uk_config_pos', ['configId', 'positionId'])
export class AssignmentGroupConfigPosition {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'config_id' })
  configId: number;

  @ManyToOne(() => AssignmentGroupConfig, (c) => c.positions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'config_id' })
  config: AssignmentGroupConfig;

  @Column({ name: 'position_id' })
  positionId: number;

  @ManyToOne(() => Position, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'position_id' })
  position: Position;
}
