import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { LinkGroup } from './link-group.entity';

/**
 * Nền tảng chứa các nhóm (Zalo, Facebook, Instagram, Threads...) - KHÔNG
 * liên quan tới MediaSource (kênh khách hàng gắn `customers.source`), dù
 * dùng chung pattern UI (Tag màu, admin CRUD, khoá/mở). Xem giải thích đầy
 * đủ trong migration 1777800000000-CreateLinkGroupsSystem.ts.
 */
@Entity('link_categories')
export class LinkCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ length: 100 })
  name: string;

  @Column({ length: 20, default: '#1677ff' })
  color: string;

  // Khoá = ẩn khỏi dropdown chọn category khi tạo Group mới, KHÔNG xoá các
  // Group đã thuộc category này (giống cách isLocked hoạt động ở MediaSource).
  @Column({ name: 'is_locked', default: false })
  isLocked: boolean;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => LinkGroup, (group) => group.category)
  groups: LinkGroup[];
}
