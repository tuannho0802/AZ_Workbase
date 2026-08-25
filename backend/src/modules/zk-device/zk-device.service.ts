import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { AttendanceLog } from '../../database/entities/attendance-log.entity';
import { AttendanceSource } from '../../common/enums/attendance-source.enum';
import { QueryAttendanceLogDto } from './dto/query-attendance-log.dto';

// node-zklib chưa có type definition chính thức -> import kiểu require,
// coi là "any" (tsconfig của project đã bật noImplicitAny: false).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ZKLib = require('node-zklib');

export interface DeviceUser {
  uid: number; // số thứ tự nội bộ trong máy (KHÔNG dùng để map)
  userId: string; // mã user do người đăng ký đặt trên máy (dùng để map)
  name: string;
  role: number;
  cardno: number;
}

interface DeviceAttendanceRecord {
  userSn: number;
  deviceUserId: string;
  recordTime: string; // ISO string do node-zklib trả về
  ip: string;
}

export interface SyncSummary {
  startedAt: Date;
  finishedAt: Date;
  totalFetchedFromDevice: number;
  insertedNew: number;
  matchedToUser: number;
  unmatchedDeviceUserIds: string[];
}

@Injectable()
export class ZkDeviceService {
  private readonly logger = new Logger(ZkDeviceService.name);

  // Chặn 2 lần sync chạy chồng nhau (vd cron chạy trong lúc admin bấm sync tay)
  private isSyncing = false;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AttendanceLog)
    private readonly attendanceLogRepo: Repository<AttendanceLog>,
  ) {}

  private get deviceIp(): string {
    // Fallback về IP thực tế đã xác nhận hoạt động, để dev vẫn chạy được
    // nếu quên set env - production PHẢI set qua .env.
    return this.configService.get<string>('ZK_DEVICE_IP') || '192.168.110.230';
  }

  private get devicePort(): number {
    return Number(this.configService.get('ZK_DEVICE_PORT') || 8818);
  }

  private get deviceSerial(): string {
    // Số sê-ri in trên nhãn máy - dùng làm khóa dedupe khi có nhiều máy sau này.
    return this.configService.get<string>('ZK_DEVICE_SERIAL') || '8116250900075';
  }

  /**
   * Endpoint ADMS Push (POST /iclock/cdata) không có xác thực nào từ phía máy
   * (không có JWT/API key - đây là giới hạn của giao thức ADMS gốc). Bù lại,
   * chỉ chấp nhận ghi dữ liệu nếu SN gửi lên khớp đúng serial máy đã cấu hình
   * - chặn request giả mạo/quét cổng ngẫu nhiên ghi rác vào bảng attendance_logs.
   * Vẫn LUÔN trả "OK" cho mọi SN (kể cả không khớp) để không làm máy lạ hiểu
   * nhầm là lỗi rồi gửi lại liên tục.
   */
  isKnownDeviceSerial(sn: string | undefined): boolean {
    return !!sn && sn === this.deviceSerial;
  }

  private createClient() {
    const timeoutMs = 10000;
    const udpInPort = 4000;
    return new ZKLib(this.deviceIp, this.devicePort, timeoutMs, udpInPort, 0, 'tcp');
  }

  /**
   * Kiểm tra nhanh tình trạng máy (không tải log) - dùng cho health-check.
   */
  async getStatus() {
    const zk = this.createClient();
    try {
      await zk.createSocket();
      const info = await zk.getInfo();
      return {
        connected: true,
        ip: this.deviceIp,
        port: this.devicePort,
        ...info,
      };
    } finally {
      await this.safeDisconnect(zk);
    }
  }

  /**
   * Lấy danh sách user đăng ký trên máy, kèm cờ đã map hay chưa với
   * nhân viên trong hệ thống (users.zk_device_user_id).
   */
  async getDeviceUsers(): Promise<
    Array<DeviceUser & { mappedUserId: number | null; mappedUserName: string | null }>
  > {
    const zk = this.createClient();
    try {
      await zk.createSocket();
      const result = await zk.getUsers();
      const deviceUsers: DeviceUser[] = result?.data ?? [];

      const mappedUsers = await this.userRepo.find({
        where: { zkDeviceUserId: Not(IsNull()) },
        select: ['id', 'name', 'zkDeviceUserId'],
      });
      const mapByDeviceUserId = new Map(
        mappedUsers.map((u) => [u.zkDeviceUserId as string, u]),
      );

      return deviceUsers.map((du) => {
        const matched = mapByDeviceUserId.get(du.userId);
        return {
          ...du,
          mappedUserId: matched?.id ?? null,
          mappedUserName: matched?.name ?? null,
        };
      });
    } finally {
      await this.safeDisconnect(zk);
    }
  }

  /**
   * Gán deviceUserId (mã user trên máy) cho 1 nhân viên trong hệ thống.
   */
  async mapUser(userId: number, deviceUserId: string): Promise<User> {
    const user = await this.userRepo.findOneByOrFail({ id: userId });
    user.zkDeviceUserId = deviceUserId;
    return this.userRepo.save(user);
  }

  /**
   * Gỡ mapping của 1 nhân viên (vd map nhầm mã user trên máy).
   * CHỈ xoá liên kết trong hệ thống (users.zk_device_user_id = null) -
   * KHÔNG đụng gì tới data/log đã đồng bộ từ máy (giữ nguyên
   * attendance_logs.matched_user_id của các log cũ, đúng nguyên tắc 1 chiều
   * không sửa data máy). Log mới đồng bộ sau khi gỡ map sẽ tự thành
   * "chưa khớp" (matchedUserId = null) vì map không còn tồn tại.
   */
  async unmapUser(userId: number): Promise<User> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`Không tìm thấy nhân viên id=${userId}`);
    }
    user.zkDeviceUserId = null;
    return this.userRepo.save(user);
  }

  /**
   * Danh sách log chấm công (đọc-only, phục vụ UI xem bảng chấm công).
   * Đây vẫn là luồng 1 chiều thuần đọc: không có hàm nào ở đây ghi/sửa lại
   * bảng attendance_logs ngoài syncNow()/ingestPushAttendance() (2 nguồn từ
   * máy) - API này chỉ SELECT.
   */
  async getAttendanceLogs(query: QueryAttendanceLogDto) {
    const { page = 1, limit = 20, userId, matched, from, to } = query;

    const qb = this.attendanceLogRepo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.matchedUser', 'matchedUser')
      .orderBy('log.recordTime', 'DESC');

    if (userId) {
      qb.andWhere('log.matchedUserId = :userId', { userId });
    }
    if (matched === 'matched') {
      qb.andWhere('log.matchedUserId IS NOT NULL');
    } else if (matched === 'unmatched') {
      qb.andWhere('log.matchedUserId IS NULL');
    }
    if (from) {
      qb.andWhere('log.recordTime >= :from', { from: `${from} 00:00:00` });
    }
    if (to) {
      qb.andWhere('log.recordTime <= :to', { to: `${to} 23:59:59` });
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Đồng bộ toàn bộ log chấm công từ máy về DB.
   * An toàn để gọi lặp lại nhiều lần: nhờ ràng buộc UNIQUE
   * (device_serial_number, user_sn) trên bảng attendance_logs,
   * log đã tồn tại sẽ tự bị bỏ qua (INSERT IGNORE), không nhân đôi dữ liệu.
   */
  async syncNow(): Promise<SyncSummary> {
    if (this.isSyncing) {
      throw new Error('Đang có 1 lượt đồng bộ khác chạy, vui lòng thử lại sau.');
    }
    this.isSyncing = true;
    const startedAt = new Date();

    const zk = this.createClient();
    try {
      await zk.createSocket();

      const usersResult = await zk.getUsers();
      const deviceUsers: DeviceUser[] = usersResult?.data ?? [];
      this.logger.log(`Đọc được ${deviceUsers.length} user từ máy.`);

      const mappedUsers = await this.userRepo.find({
        where: { zkDeviceUserId: Not(IsNull()) },
        select: ['id', 'zkDeviceUserId'],
      });
      const userIdByDeviceUserId = new Map(
        mappedUsers.map((u) => [u.zkDeviceUserId as string, u.id]),
      );

      const logsResult = await zk.getAttendances((received: number, total: number) => {
        if (total > 0 && received % 1000 === 0) {
          this.logger.debug(`Đang tải log: ${received}/${total}`);
        }
      });
      const records: DeviceAttendanceRecord[] = logsResult?.data ?? [];
      this.logger.log(`Đọc được ${records.length} log chấm công từ máy.`);

      const unmatchedSet = new Set<string>();
      let insertedNew = 0;
      let matchedToUser = 0;

      const CHUNK_SIZE = 500;
      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        const values = chunk.map((rec) => {
          const matchedUserId = userIdByDeviceUserId.get(rec.deviceUserId) ?? null;
          if (matchedUserId) {
            matchedToUser++;
          } else {
            unmatchedSet.add(rec.deviceUserId);
          }
          return {
            deviceSerialNumber: this.deviceSerial,
            deviceUserId: rec.deviceUserId,
            userSn: rec.userSn,
            recordTime: new Date(rec.recordTime),
            matchedUserId,
            source: AttendanceSource.DEVICE_PULL,
          };
        });

        const result = await this.attendanceLogRepo
          .createQueryBuilder()
          .insert()
          .into(AttendanceLog)
          .values(values)
          .orIgnore() // INSERT IGNORE - bỏ qua record đã có (trùng unique key)
          .execute();

        // MySQL driver: raw.affectedRows đếm cả record bị ignore lẫn record
        // mới insert nên KHÔNG dùng affectedRows để suy ra số insert mới
        // chính xác 100%; ta chấp nhận đây là con số ước lượng cho log.
        insertedNew += result.identifiers.filter((x) => x?.id).length;
      }

      const finishedAt = new Date();
      const summary: SyncSummary = {
        startedAt,
        finishedAt,
        totalFetchedFromDevice: records.length,
        insertedNew,
        matchedToUser,
        unmatchedDeviceUserIds: Array.from(unmatchedSet),
      };

      this.logger.log(
        `Đồng bộ xong: fetched=${summary.totalFetchedFromDevice}, insertedNew~=${summary.insertedNew}, matched=${summary.matchedToUser}, unmatchedUsers=${summary.unmatchedDeviceUserIds.length}`,
      );

      return summary;
    } finally {
      await this.safeDisconnect(zk);
      this.isSyncing = false;
    }
  }

  private async safeDisconnect(zk: any): Promise<void> {
    try {
      await zk.disconnect();
    } catch {
      // bỏ qua lỗi khi disconnect
    }
  }

  /**
   * Ghi nhận các dòng ATTLOG máy tự đẩy lên qua ADMS Push (POST /iclock/cdata).
   * Gọi bởi AdmsController - xem đó để biết định dạng request/response đúng
   * chuẩn giao thức ZKTeco (sai định dạng response sẽ khiến máy gửi lại vô hạn).
   *
   * Mỗi dòng ATTLOG cách nhau bởi \t (tab), theo thứ tự:
   *   PIN \t DateTime \t Status \t VerifyMode \t Workcode \t Reserved \t Reserved
   * PIN = deviceUserId (mã user trên máy, KHÔNG phải id trong hệ thống).
   *
   * An toàn để gọi lặp lại: máy có thể gửi lại log chưa được ACK (mất mạng,
   * timeout...) - nhờ UNIQUE (device_serial_number, device_user_id, record_time)
   * trên bảng attendance_logs, dòng đã tồn tại sẽ tự bị bỏ qua (INSERT IGNORE).
   */
  async ingestPushAttendance(deviceSerialNumber: string, rawBody: string): Promise<number> {
    if (!rawBody?.trim()) return 0;

    const lines = rawBody.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return 0;

    const mappedUsers = await this.userRepo.find({
      where: { zkDeviceUserId: Not(IsNull()) },
      select: ['id', 'zkDeviceUserId'],
    });
    const userIdByDeviceUserId = new Map(
      mappedUsers.map((u) => [u.zkDeviceUserId as string, u.id]),
    );

    const values = lines
      .map((line) => {
        const parts = line.split('\t');
        const [deviceUserId, dateTime, status, verify] = parts;
        if (!deviceUserId || !dateTime) return null; // dòng hỏng/không đủ field bắt buộc -> bỏ qua, không throw (tránh máy gửi lại vô hạn)

        const recordTime = new Date(dateTime.replace(' ', 'T'));
        if (Number.isNaN(recordTime.getTime())) return null;

        return {
          deviceSerialNumber,
          deviceUserId,
          userSn: null,
          recordTime,
          statusCode: status ?? null,
          verifyMode: verify ?? null,
          matchedUserId: userIdByDeviceUserId.get(deviceUserId) ?? null,
          source: AttendanceSource.DEVICE_PUSH,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    if (values.length === 0) return 0;

    const result = await this.attendanceLogRepo
      .createQueryBuilder()
      .insert()
      .into(AttendanceLog)
      .values(values)
      .orIgnore() // INSERT IGNORE - máy gửi lại log cũ (do mất mạng/timeout) sẽ tự bị bỏ qua, không nhân đôi
      .execute();

    const insertedCount = result.identifiers.filter((x) => x?.id).length;
    this.logger.log(
      `[ADMS Push] SN=${deviceSerialNumber}: nhận ${lines.length} dòng, ghi mới ~${insertedCount}.`,
    );
    return insertedCount;
  }
}