import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, OneToMany } from 'typeorm';
import { BooleanTransformer } from '../transformers/boolean.transformer';
import { Fanpage } from './fanpage.entity';

/**
 * Danh mục "Tình trạng Page" (Bình thường / Bị hạn chế / Checkpoint / Bị khoá / Đã bỏ...). Admin/Assistant tự thêm/sửa/KHOÁ,
 * KHÔNG xoá (Page cũ vẫn tham chiếu) - khoá = không chọn được cho Page, Page đang dùng vẫn hiện đúng tên.
 * `isBlocking` = tình trạng "ngưng hoạt động thật" -> Page bị loại khỏi KPI/nhắc việc (PLAN mục 3.1, `isTracked`).
 * `isDefault` = tình trạng gán cho Page mới (đúng 1 dòng, không đổi/khoá qua API).
 */
@Entity('fanpage_health_statuses')
@Index('UQ_fanpage_health_statuses_name', ['name'], { unique: true })
export class FanpageHealthStatus {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 50 })
    name: string;

    @Column({ type: 'varchar', length: 20, default: '#52c41a' })
    color: string;

    @Column({ name: 'is_blocking', type: 'tinyint', default: 0, transformer: new BooleanTransformer() })
    isBlocking: boolean;

    @Column({ name: 'is_default', type: 'tinyint', default: 0, transformer: new BooleanTransformer() })
    isDefault: boolean;

    @Column({ name: 'is_locked', type: 'tinyint', default: 0, transformer: new BooleanTransformer() })
    isLocked: boolean;

    @Column({ name: 'sort_order', type: 'int', default: 0 })
    sortOrder: number;

    @OneToMany(() => Fanpage, (f) => f.healthStatus)
    fanpages: Fanpage[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}