import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, OneToMany } from 'typeorm';
import { BooleanTransformer } from '../transformers/boolean.transformer';
import { Fanpage } from './fanpage.entity';

/**
 * Danh mục nền tảng của Fanpage (Facebook, TikTok, Instagram...). Admin/Assistant tự thêm/sửa/KHOÁ,
 * KHÔNG xoá (Page cũ vẫn tham chiếu) - khoá = không chọn được cho Page MỚI, Page cũ vẫn hiện đúng tên.
 */
@Entity('fanpage_platforms')
@Index('UQ_fanpage_platforms_name', ['name'], { unique: true })
export class FanpagePlatform {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 50 })
    name: string;

    @Column({ type: 'varchar', length: 20, default: '#1677ff' })
    color: string;

    @Column({ name: 'is_active', type: 'tinyint', default: 1, transformer: new BooleanTransformer() })
    isActive: boolean;

    @Column({ name: 'sort_order', type: 'int', default: 0 })
    sortOrder: number;

    @OneToMany(() => Fanpage, (f) => f.platform)
    fanpages: Fanpage[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}