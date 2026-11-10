import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Fanpage } from './fanpage.entity';

/** Ghi chú tiến trình phát triển Page (timeline có timestamp, mirror `customer_notes`). */
@Entity('fanpage_notes')
@Index('IDX_fanpage_notes_page_created', ['fanpageId', 'createdAt'])
export class FanpageNote {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'fanpage_id', type: 'int' })
    fanpageId: number;

    @ManyToOne(() => Fanpage, (f) => f.notes, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'fanpage_id' })
    fanpage: Fanpage;

    @Column({ type: 'text' })
    note: string;

    @Column({ name: 'created_by_id', type: 'int', nullable: true, default: null })
    createdById: number | null;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'created_by_id' })
    createdBy: User | null;

    @Column({ name: 'updated_by_id', type: 'int', nullable: true, default: null })
    updatedById: number | null;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'updated_by_id' })
    updatedBy: User | null;

    // Số lần ghi chú đã được SỬA (không tính lần tạo) - hiện "Đã sửa N lần" trên UI.
    @Column({ name: 'edit_count', type: 'int', default: 0 })
    editCount: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}