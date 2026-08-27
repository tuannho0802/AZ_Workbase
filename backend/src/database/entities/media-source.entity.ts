import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('media_sources')
export class MediaSource {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ length: 100 })
  name: string;

  // Mã màu hex (vd '#1877F2') - UI dùng để tô màu Tag hiển thị nguồn này ở
  // mọi nơi (dropdown thêm khách hàng, filter Chia Data, bảng khách hàng...).
  @Column({ length: 20, default: '#1677ff' })
  color: string;

  // Khoá = ẩn khỏi dropdown "Thêm khách hàng mới" (chỉ cho chọn nguồn đang
  // mở), nhưng KHÔNG xoá/đổi dữ liệu customer cũ đã dùng nguồn này - source
  // trên bảng customers là free-text (không có FK), nên khoá không ảnh
  // hưởng gì tới việc hiển thị/lọc customer hiện có.
  @Column({ name: 'is_locked', default: false })
  isLocked: boolean;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}