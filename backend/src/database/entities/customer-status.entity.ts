import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * CustomerStatus (Trạng thái khách hàng) - thay thế ENUM cứng
 * `customers.status` cũ, cho phép Admin tự CRUD trạng thái qua UI "Quản lý
 * status Khách" thay vì phải thêm thủ công trong DB - xem
 * `CreateCustomerStatuses1781400000000`.
 *
 * `code` bất biến sau khi tạo (giống `Position.code`) vì đây là giá trị THẬT
 * SỰ được lưu vào cột `customers.status` (khác `Position.code` chỉ dùng làm
 * định danh log) - đổi `code` sau khi đã có customer dùng sẽ làm "mồ côi"
 * dữ liệu cũ, nên khoá cứng ở DTO update, không chặn thêm ở entity.
 */
@Entity('customer_statuses')
export class CustomerStatus {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  // TRUE cho 5 trạng thái seed sẵn từ ENUM cũ (closed/pending/potential/lost/
  // inactive) - bảo vệ khỏi bị xoá nhầm ở `CustomerStatusesService.remove()`,
  // đúng pattern `Position.isSystem`. Admin vẫn ĐƯỢC sửa tên/màu/mô tả của
  // status hệ thống, chỉ không xoá được.
  @Column({ name: 'is_system', default: false })
  isSystem: boolean;

  // Mã màu hex (vd '#52c41a') - UI dùng để tô màu Tag hiển thị trạng thái
  // này ở mọi nơi (bảng khách hàng, dropdown đổi trạng thái, filter...).
  @Column({ type: 'varchar', length: 20, default: '#1890ff' })
  color: string;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
