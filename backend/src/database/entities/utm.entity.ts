import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
    ManyToOne,
    JoinColumn,
    OneToMany,
} from 'typeorm';
import { User } from './user.entity';
import { UtmSecondaryManager } from './utm-secondary-manager.entity';

export type UtmVisibility = 'shared' | 'restricted';

/**
 * Danh mục UTM (trước đây `customers.campaign` là chuỗi nhập tay).
 * `customers.campaign` vẫn được giữ làm "snapshot tên" (= utm.name) - xem PLAN_UTM_MANAGEMENT D1.
 * Tên UNIQUE theo collation utf8mb4_unicode_ci (không phân biệt hoa/thường và dấu) - do DB chặn.
 * Sở hữu = `primaryManagerId` (Quản lý chính) + `utm_secondary_managers` (Quản lý phụ).
 */
@Entity('utms')
@Index('UQ_utms_name', ['name'], { unique: true })
export class Utm {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 100 })
    name: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    description: string | null;

    @Column({ type: 'varchar', length: 20, default: '#1677ff' })
    color: string;

    // shared = mọi người chọn được; restricted = chỉ chính/phụ/quyền rộng.
    @Column({ type: 'enum', enum: ['shared', 'restricted'], default: 'shared' })
    visibility: UtmVisibility;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    // Thời điểm khoá gần nhất. Chỉ có nghĩa khi is_active = 0 (nguồn sự thật "khoá hay không" vẫn là is_active);
    // mở khoá -> NULL. UTM khoá từ trước migration được backfill = updated_at.
    @Column({ name: 'locked_at', type: 'timestamp', nullable: true, default: null })
    lockedAt: Date | null;

    // Quản lý chính. NULL với UTM backfill từ dữ liệu cũ (chưa có chủ).
    @Column({ name: 'primary_manager_id', type: 'int', nullable: true, default: null })
    primaryManagerId: number | null;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'primary_manager_id' })
    primaryManager: User | null;

    @Column({ name: 'created_by_id', type: 'int', nullable: true, default: null })
    createdById: number | null;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'created_by_id' })
    createdBy: User | null;

    @OneToMany(() => UtmSecondaryManager, (m) => m.utm)
    secondaryManagers: UtmSecondaryManager[];

    @Column({ name: 'sort_order', default: 0 })
    sortOrder: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
