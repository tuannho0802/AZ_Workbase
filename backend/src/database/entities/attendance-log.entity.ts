import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { AttendanceSource } from '../../common/enums/attendance-source.enum';

/**
 * Lưu nguyên (raw) từng lượt chấm công đọc được từ máy chấm công.
 *
 * Vì máy KHÔNG hỗ trợ "chỉ lấy log mới" (mỗi lần getAttendances() luôn trả
 * về TOÀN BỘ log đang có trong máy), nên bảng này bắt buộc phải có ràng
 * buộc UNIQUE trên (deviceSerialNumber, userSn) để lần sync sau không tạo
 * trùng bản ghi - INSERT ... ON DUPLICATE KEY sẽ tự bỏ qua log đã có.
 *
 * userSn = số thứ tự log ngay trên chính máy (field "userSn" do node-zklib
 * trả về) - đây là ID ổn định của 1 lượt chấm công trên 1 máy, dùng làm
 * khóa dedupe, KHÔNG phải mã nhân viên.
 */
@Entity('attendance_logs')
@Unique('UQ_device_log', ['deviceSerialNumber', 'userSn'])
@Index(['matchedUserId', 'recordTime'])
export class AttendanceLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    name: 'device_serial_number',
    type: 'varchar',
    length: 50,
    comment: 'Số sê-ri máy chấm công (vd: 8116250900075) - phòng khi có nhiều máy',
  })
  deviceSerialNumber: string;

  @Column({
    name: 'device_user_id',
    type: 'varchar',
    length: 50,
    comment: 'Mã "User ID" trên máy chấm công (chuỗi thô, vd "44")',
  })
  deviceUserId: string;

  @Column({
    name: 'user_sn',
    type: 'int',
    comment: 'Số thứ tự log trên máy (khóa dedupe cùng với device_serial_number)',
  })
  userSn: number;

  @Column({ name: 'record_time', type: 'timestamp' })
  recordTime: Date;

  @Column({
    name: 'matched_user_id',
    type: 'int',
    nullable: true,
    comment: 'FK users.id nếu đã map được deviceUserId -> nhân viên trong hệ thống, null nếu chưa map được',
  })
  matchedUserId: number | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'matched_user_id' })
  matchedUser: User | null;

  @Column({
    type: 'enum',
    enum: AttendanceSource,
    default: AttendanceSource.DEVICE_PULL,
  })
  source: AttendanceSource;

  @CreateDateColumn({ name: 'synced_at' })
  syncedAt: Date;
}
