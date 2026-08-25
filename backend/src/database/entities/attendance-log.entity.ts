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
 * Lưu nguyên (raw) từng lượt chấm công, từ 2 nguồn:
 *
 * 1) DEVICE_PUSH (nguồn chính, tự động): máy tự đẩy dữ liệu qua giao thức
 *    ADMS Push (POST /iclock/cdata?table=ATTLOG) - xem AdmsController. Máy
 *    không gửi kèm 1 "số thứ tự log" nào để dedupe, nên khoá chống trùng cho
 *    nguồn này là (deviceSerialNumber, deviceUserId, recordTime) - 1 người,
 *    1 mốc giờ, cùng máy chỉ có thể có 1 lượt chấm công hợp lệ.
 *
 * 2) DEVICE_PULL (nguồn phụ, chỉ chạy tay): server chủ động kết nối TCP kéo
 *    log về (chỉ hoạt động khi admin chạy từ cùng LAN/VPN với máy - xem
 *    ZkDeviceService.syncNow()). Nguồn này CÓ userSn (số thứ tự log ngay
 *    trên máy, do node-zklib trả về) nên dùng khoá riêng
 *    (deviceSerialNumber, userSn) để dedupe, chính xác hơn.
 *
 * Cả 2 khoá unique cùng tồn tại song song; mỗi dòng chỉ thuộc 1 trong 2
 * nguồn nên chỉ 1 trong 2 khoá có giá trị khác NULL (MySQL cho phép nhiều
 * dòng cùng NULL trong 1 unique index, không tính là trùng).
 */
@Entity('attendance_logs')
@Unique('UQ_device_pull_log', ['deviceSerialNumber', 'userSn'])
@Unique('UQ_device_push_log', [
  'deviceSerialNumber',
  'deviceUserId',
  'recordTime',
])
@Index(['matchedUserId', 'recordTime'])
export class AttendanceLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    name: 'device_serial_number',
    type: 'varchar',
    length: 50,
    comment:
      'Số sê-ri máy chấm công (vd: 8116250900075) - phòng khi có nhiều máy',
  })
  deviceSerialNumber: string;

  @Column({
    name: 'device_user_id',
    type: 'varchar',
    length: 50,
    comment: 'Mã "User ID"/"PIN" trên máy chấm công (chuỗi thô, vd "44")',
  })
  deviceUserId: string;

  @Column({
    name: 'user_sn',
    type: 'int',
    nullable: true,
    comment:
      'Số thứ tự log trên máy - CHỈ có khi nguồn là DEVICE_PULL (node-zklib getAttendances trả về). Nguồn DEVICE_PUSH (ADMS) không có field này -> luôn NULL.',
  })
  userSn: number | null;

  @Column({ name: 'record_time', type: 'datetime' })
  recordTime: Date;

  @Column({
    name: 'status_code',
    type: 'varchar',
    length: 10,
    nullable: true,
    comment:
      'Mã trạng thái chấm công thô do máy gửi (vd 0=Check In, 1=Check Out - tuỳ cấu hình máy) - chỉ có ở nguồn DEVICE_PUSH, lưu nguyên văn không tự suy diễn ý nghĩa vì mapping khác nhau tuỳ model/cấu hình máy',
  })
  statusCode: string | null;

  @Column({
    name: 'verify_mode',
    type: 'varchar',
    length: 10,
    nullable: true,
    comment:
      'Mã phương thức xác thực thô do máy gửi (vd vân tay/khuôn mặt/thẻ...) - chỉ có ở nguồn DEVICE_PUSH',
  })
  verifyMode: string | null;

  @Column({
    name: 'matched_user_id',
    type: 'int',
    nullable: true,
    comment:
      'FK users.id nếu đã map được deviceUserId -> nhân viên trong hệ thống, null nếu chưa map được',
  })
  matchedUserId: number | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'matched_user_id' })
  matchedUser: User | null;

  @Column({
    type: 'enum',
    enum: AttendanceSource,
    default: AttendanceSource.DEVICE_PUSH,
  })
  source: AttendanceSource;

  @CreateDateColumn({ name: 'synced_at' })
  syncedAt: Date;
}