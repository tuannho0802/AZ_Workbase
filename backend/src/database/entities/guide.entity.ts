import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { GuideRole } from './guide-role.entity';
import { GuidePosition } from './guide-position.entity';
import { GuideDepartment } from './guide-department.entity';
import { GuidePermission } from './guide-permission.entity';
import { BooleanTransformer } from '../transformers/boolean.transformer';

/**
 * Bài Hướng dẫn sử dụng (Markdown) - PLAN_HARDENING P7. Xoá mềm qua `deleted_at`.
 * Hiển thị theo `guide_roles`: không có dòng nào = mọi role đăng nhập đều thấy.
 */
@Entity('guides')
export class Guide {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 150, unique: true })
  slug: string;

  @Column({ type: 'mediumtext' })
  content: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_published', type: 'tinyint', default: 0, transformer: new BooleanTransformer() })
  isPublished: boolean;

  /**
   * @deprecated Cột cũ (1 quyền, migration 1785700000000). Từ migration 1785800000000 nguồn thật là bảng `guide_permissions`
   * (nhiều quyền); code KHÔNG còn đọc/ghi cột này. Giữ nguyên để không mất dữ liệu, chỉ drop khi có lệnh tường minh.
   */
  @Column({ name: 'required_permission', type: 'varchar', length: 100, nullable: true })
  requiredPermission: string | null;

  /**
   * SHA-256 của bài ở lần `npm run guides:sync -- --apply` gần nhất (migration 1785900000000). NULL = chưa từng đồng bộ từ file.
   * So với hash DB hiện tại để phát hiện bài bị sửa tay trên UI. Không hiển thị ra API.
   */
  @Column({ name: 'source_hash', type: 'varchar', length: 64, nullable: true })
  sourceHash: string | null;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number | null;

  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy: number | null;

  @OneToMany(() => GuideRole, (gr) => gr.guide)
  guideRoles: GuideRole[];

  @OneToMany(() => GuidePosition, (gp) => gp.guide)
  guidePositions: GuidePosition[];

  @OneToMany(() => GuideDepartment, (gd) => gd.guide)
  guideDepartments: GuideDepartment[];

  @OneToMany(() => GuidePermission, (gp) => gp.guide)
  guidePermissions: GuidePermission[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;
}
