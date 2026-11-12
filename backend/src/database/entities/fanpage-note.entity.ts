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
import { Customer } from './customer.entity';

/** Ghi chú tiến trình phát triển Page (timeline có timestamp, mirror `customer_notes`). */
@Entity('fanpage_notes')
@Index('IDX_fanpage_notes_page_created', ['fanpageId', 'createdAt'])
@Index('UQ_fanpage_notes_lead_customer', ['leadCustomerId'], { unique: true })
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

    // GĐ5b: khách do ghi chú này sinh ra. UNIQUE: 1 khách chỉ gắn với tối đa 1 ghi chú (MySQL cho nhiều NULL).
    @Column({ name: 'lead_customer_id', type: 'int', nullable: true, default: null })
    leadCustomerId: number | null;

    @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'lead_customer_id' })
    leadCustomer: Customer | null;

    // Số lần ghi chú đã được SỬA (không tính lần tạo) - hiện "Đã sửa N lần" trên UI.
    @Column({ name: 'edit_count', type: 'int', default: 0 })
    editCount: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}