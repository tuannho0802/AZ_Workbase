import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BooleanTransformer } from '../transformers/boolean.transformer';

import { Customer } from './customer.entity';
import { User } from './user.entity';

@Entity('customer_notes')
export class CustomerNote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'customer_id' })
  customerId: number;

  @ManyToOne(() => Customer, customer => customer.notes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ type: 'text' })
  note: string;

  @Column({
    name: 'note_type',
    type: 'enum',
    enum: ['general', 'call', 'meeting', 'follow_up'],
    default: 'general',
  })
  noteType: string;

  @Column({ name: 'is_important', default: false, transformer: new BooleanTransformer() })
  isImportant: boolean;


  @Column({ name: 'created_by' })
  createdBy: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdByUser: User;

  // NULL nếu ghi chú chưa từng được sửa lần nào (kể cả bởi chính người
  // tạo) - FE (CustomerNotesTab.tsx) chỉ hiện dòng hệ thống "Sửa cuối bởi"
  // khi `updatedBy` khác `createdBy` (yêu cầu nghiệp vụ: chỉ cần biết khi
  // 2 NGƯỜI KHÁC NHAU cùng chạm vào 1 ghi chú, tự sửa ghi chú của mình
  // không cần hiển thị thêm dòng nào).
  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'updated_by' })
  updatedByUser: User | null;

  // Đếm số lần ghi chú đã được SỬA (không tính lần tạo đầu tiên) - dùng để
  // hiện "Đã sửa N lần" trên UI cạnh thời gian sửa cuối, bất kể người sửa
  // cuối có trùng người tạo hay không (khác `updatedBy`, chỉ dùng để hiện
  // TÊN người sửa khi khác người tạo). Tăng dần trong
  // `CustomersService.updateNote()` mỗi lần PATCH thành công.
  @Column({ name: 'edit_count', type: 'int', default: 0 })
  editCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}