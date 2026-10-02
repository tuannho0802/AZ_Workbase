import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Guide } from './guide.entity';

/**
 * Guide yêu cầu người xem phải CÓ những permission nào (AND - phải có TẤT CẢ). Không có dòng = không yêu cầu quyền.
 * Cố ý KHÔNG có FK sang `permissions.key`: BE validate khi ghi; key không còn tồn tại -> ẩn với người không có `guides.manage`.
 */
@Entity('guide_permissions')
export class GuidePermission {
  @PrimaryColumn({ name: 'guide_id', type: 'int' })
  guideId: number;

  @PrimaryColumn({ name: 'permission_key', type: 'varchar', length: 100 })
  permissionKey: string;

  @ManyToOne(() => Guide, (g) => g.guidePermissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'guide_id' })
  guide: Guide;
}
