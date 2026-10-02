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

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number | null;

  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy: number | null;

  @OneToMany(() => GuideRole, (gr) => gr.guide)
  guideRoles: GuideRole[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;
}
