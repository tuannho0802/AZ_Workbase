import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

/**
 * Cache tên user đăng ký TRÊN MÁY chấm công (không phải nhân viên hệ thống).
 *
 * Vì sao cần cache thay vì gọi thẳng zk.getUsers() mỗi lần cần hiển thị: máy
 * chấm công nằm sau NAT/LAN nội bộ, chỉ backend chạy CÙNG LAN/VPN mới gọi
 * được zk.getUsers() (giống hạn chế của syncNow()). Nhưng bảng "Bảng chấm
 * công"/"Tổng hợp chấm công" chạy trên Vercel (không có LAN) vẫn cần hiển thị
 * TÊN của những user CHƯA MAP với nhân viên hệ thống (thay vì chỉ hiện trơ
 * mã UID) - nên phải lưu lại (cache) tên này vào DB tại các thời điểm CÓ kết
 * nối LAN thật (syncNow(), hoặc khi admin mở tab "Mapping nhân viên" -
 * getDeviceUsers()), rồi đọc lại từ DB khi cần, không phụ thuộc kết nối máy.
 */
@Entity('zk_device_user_cache')
@Unique('UQ_zk_device_user_cache', ['deviceSerialNumber', 'deviceUserId'])
export class ZkDeviceUserCache {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'device_serial_number', type: 'varchar', length: 50 })
  deviceSerialNumber: string;

  @Column({
    name: 'device_user_id',
    type: 'varchar',
    length: 50,
    comment: 'Mã "User ID"/"PIN" trên máy - khớp với attendance_logs.device_user_id',
  })
  deviceUserId: string;

  @Column({
    type: 'varchar',
    length: 100,
    comment: 'Tên user do người đăng ký đặt TRÊN MÁY (không phải tên nhân viên hệ thống)',
  })
  name: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
