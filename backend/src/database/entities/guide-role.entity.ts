import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Guide } from './guide.entity';
import { RoleEntity } from './role.entity';

/** Guide hiển thị cho role nào (dùng `roles` động, không hardcode tên role). Không có dòng = mọi role. */
@Entity('guide_roles')
export class GuideRole {
  @PrimaryColumn({ name: 'guide_id', type: 'int' })
  guideId: number;

  @PrimaryColumn({ name: 'role_id', type: 'int' })
  roleId: number;

  @ManyToOne(() => Guide, (g) => g.guideRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'guide_id' })
  guide: Guide;

  @ManyToOne(() => RoleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: RoleEntity;
}
