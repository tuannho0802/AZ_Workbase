import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    Index,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Utm } from './utm.entity';
import { User } from './user.entity';

/** "Quản lý phụ" của 1 UTM - bảng join thuần add/remove (mirror LinkGroupSecondaryManager). */
@Entity('utm_secondary_managers')
@Index('UQ_utm_secondary_utm_user', ['utmId', 'userId'], { unique: true })
export class UtmSecondaryManager {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'utm_id' })
    utmId: number;

    @ManyToOne(() => Utm, (u) => u.secondaryManagers, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'utm_id' })
    utm: Utm;

    @Column({ name: 'user_id' })
    @Index('IDX_utm_secondary_user')
    userId: number;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'added_by_id', type: 'int', nullable: true })
    addedById: number | null;

    @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'added_by_id' })
    addedBy: User | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
