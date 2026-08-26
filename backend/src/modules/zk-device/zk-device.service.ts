import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not, In } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { AttendanceLog } from '../../database/entities/attendance-log.entity';
import { ZkDeviceUserCache } from '../../database/entities/zk-device-user-cache.entity';
import { AttendanceSource } from '../../common/enums/attendance-source.enum';
import { QueryAttendanceLogDto } from './dto/query-attendance-log.dto';
import { QueryAttendanceSummaryDto } from './dto/query-attendance-summary.dto';
import { decodeDeviceLocalTime } from '../../integrations/zk-device/decode-device-time.util';

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
  // ⚠️ Thực chất là 1 object `Date` do node-zklib tự parse (KHÔNG phải string
  // dù tên field dễ gây hiểu lầm) - nhưng Date này lệch giờ nếu tiến trình
  // Node không chạy múi giờ GMT+7 (xem decode-device-time.util.ts). TUYỆT ĐỐI
  // không gọi .toISOString()/new Date(rec.recordTime) trực tiếp trên field
  // này - luôn phải đi qua decodeDeviceLocalTime() trước.
  recordTime: Date;
  ip: string;
}

export interface SyncSummary {
  startedAt: Date;
  finishedAt: Date;
  totalFetchedFromDevice: number;
  // Số log THẬT SỰ máy báo có (qua zk.getInfo().logCounts) - dùng để đối
  // chiếu xem lần fetch này có bị thiếu hay không. null nếu không lấy được
  // getInfo() (vd máy không hỗ trợ / lỗi kết nối lúc gọi).
  expectedLogCount: number | null;
  // true nếu SAU KHI đã thử lại đủ MAX_SYNC_ATTEMPTS lần vẫn không fetch đủ
  // (records.length < expectedLogCount) hoặc thư viện báo lỗi giữa chừng -
  // admin cần biết để không tin nhầm vào 1 con số bị cắt cụt.
  partialFetch: boolean;
  // Số lần đã thử fetch thực tế trong lượt sync này (1 = thành công ngay từ đầu).
  fetchAttempts: number;
  // Mô tả lỗi/lý do thiếu data của LẦN THỬ CUỐI CÙNG, null nếu fetch đủ.
  fetchWarning: string | null;
  insertedNew: number;
  matchedToUser: number;
  unmatchedDeviceUserIds: string[];
  invalidTimeCount: number;
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
    @InjectRepository(ZkDeviceUserCache)
    private readonly deviceUserCacheRepo: Repository<ZkDeviceUserCache>,
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
   * ⚠️ ĐÃ THỬ NHƯNG KHÔNG DÙNG ĐƯỢC: gói "node-zklib" v1.3.0 (bản đang cài
   * trong package.json) có constructor CHỈ nhận 4 tham số
   * (ip, port, timeout, inport) - không có tham số Comm Key/password nào cả,
   * khác với tài liệu của 1 số bản fork cùng tên. Máy chấm công ĐANG YÊU CẦU
   * Comm Key sẽ luôn từ chối kết nối từ thư viện này, không có cách nào gửi
   * mật khẩu qua được ở phiên bản hiện tại.
   *
   * => Quyết định hiện tại: giữ Comm Key = 0 trên máy chấm công (không đặt
   * mật khẩu ở tầng giao thức TCP). Cổng 18818 sau port-forward do đó KHÔNG
   * có lớp xác thực nào ở tầng thiết bị - đây là đánh đổi đã được xác nhận
   * chấp nhận, không phải thiếu sót. Nếu sau này cần bật lại Comm Key, phải
   * đổi sang thư viện khác có hỗ trợ thật (vd tự triển khai theo
   * https://github.com/adrobinoga/zk-protocol) trước, không chỉ đặt biến
   * môi trường suông như trước đây.
   */

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
    // node-zklib v1.3.0 chỉ nhận đúng 4 tham số này - xem giải thích ở
    // getter phía trên vì sao không có tham số Comm Key.
    return new ZKLib(this.deviceIp, this.devicePort, timeoutMs, udpInPort);
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
   * Lưu lại (cache) tên user đăng ký TRÊN MÁY vào DB - xem giải thích đầy đủ
   * ở ZkDeviceUserCache entity. Gọi mỗi khi có 1 lần đọc `zk.getUsers()`
   * thành công (LAN/VPN) - getDeviceUsers() và syncNow().
   */
  private async upsertDeviceUserCache(deviceUsers: DeviceUser[]): Promise<void> {
    if (deviceUsers.length === 0) return;
    const values = deviceUsers.map((du) => ({
      deviceSerialNumber: this.deviceSerial,
      deviceUserId: du.userId,
      name: du.name?.trim() || `UID ${du.userId}`,
    }));
    await this.deviceUserCacheRepo
      .createQueryBuilder()
      .insert()
      .into(ZkDeviceUserCache)
      .values(values)
      .orUpdate(['name'], ['device_serial_number', 'device_user_id'])
      // ⚠️ FIX BUG (đúng nguyên nhân lỗi "Cannot update entity because entity
      // id is not set in the entity" khi mở tab Mapping nhân viên): mặc định
      // TypeORM cố ghi lại id do DB tự sinh vào TỪNG object trong `values`
      // sau khi insert/upsert hàng loạt. Với MySQL, insert NHIỀU dòng/1 câu
      // lệnh chỉ trả về ĐÚNG 1 insertId (dòng đầu) - TypeORM không map được
      // id cho các dòng còn lại -> ném lỗi này. Đã tắt ở syncNow()/
      // ingestPushAttendance() nhưng quên áp dụng ở đây (hàm mới thêm sau) -
      // đây chính là chỗ còn sót gây lỗi khi mở tab "Mapping nhân viên".
      .updateEntity(false)
      .execute();
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

      await this.upsertDeviceUserCache(deviceUsers);

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
   * ⚠️ Bug thực tế đã phát hiện (25/08): `matchedUserId` trước đây CHỈ được
   * gán 1 LẦN DUY NHẤT, tại đúng thời điểm 1 dòng log được ghi vào DB (dù từ
   * PULL hay PUSH) - dựa trên mapping (`users.zk_device_user_id`) đang có TẠI
   * THỜI ĐIỂM ĐÓ. Nếu 1 nhân viên được map SAU KHI log của họ đã tồn tại
   * trong DB (thứ tự bình thường: máy đẩy log suốt cả tháng trước khi admin
   * kịp map hết người), các log cũ đó bị "đông cứng" mãi mãi ở
   * matched_user_id = NULL, KHÔNG tự cập nhật dù mapping đã có sau đó - và vì
   * getAttendanceSummary() chỉ lấy log matched_user_id IS NOT NULL, log của
   * người đó biến mất khỏi bảng tổng hợp dù dữ liệu thô vẫn còn nguyên trong
   * attendance_logs (đúng hiện tượng "Logs chấm công có nhưng Tổng hợp
   * không").
   *
   * Sửa: quét lại TOÀN BỘ log đang NULL, so với mapping HIỆN TẠI (không phải
   * mapping tại thời điểm ghi log), gán lại nếu khớp. Gọi hàm này ở 2 chỗ:
   * (1) ngay sau khi mapUser() lưu 1 mapping mới - có hiệu lực tức thì, không
   * cần đợi lần sync kế tiếp; (2) đầu mỗi lần syncNow() - để phòng trường hợp
   * ADMS Push ghi log trong lúc mapping vừa được xoá/đổi (unmapUser rồi map
   * lại người khác vào đúng deviceUserId đó).
   */
  async rematchUnmatchedLogs(): Promise<number> {
    const mappedUsers = await this.userRepo.find({
      where: { zkDeviceUserId: Not(IsNull()) },
      select: ['id', 'zkDeviceUserId'],
    });

    if (mappedUsers.length === 0) return 0;

    let totalUpdated = 0;
    // Chạy từng mapping riêng (không gộp 1 câu UPDATE ... CASE WHEN) để đơn
    // giản, dễ đọc log, và số lượng mapping (vài chục nhân viên) quá nhỏ để
    // lo ngại hiệu năng N câu UPDATE riêng lẻ.
    for (const user of mappedUsers) {
      const result = await this.attendanceLogRepo
        .createQueryBuilder()
        .update(AttendanceLog)
        .set({ matchedUserId: user.id })
        .where('device_user_id = :deviceUserId', {
          deviceUserId: user.zkDeviceUserId,
        })
        .andWhere('matched_user_id IS NULL')
        .execute();
      totalUpdated += result.affected ?? 0;
    }

    if (totalUpdated > 0) {
      this.logger.log(
        `[Rematch] Đã khớp lại ${totalUpdated} log trước đó chưa map được nhân viên, theo mapping hiện tại.`,
      );
    }

    return totalUpdated;
  }

  /**
   * Gán deviceUserId (mã user trên máy) cho 1 nhân viên trong hệ thống.
   */
  async mapUser(userId: number, deviceUserId: string): Promise<User> {
    const user = await this.userRepo.findOneByOrFail({ id: userId });
    user.zkDeviceUserId = deviceUserId;
    const saved = await this.userRepo.save(user);
    // Có hiệu lực ngay: log cũ của người này (nếu có, đang NULL) được khớp
    // lại luôn, không cần đợi lần sync kế tiếp - xem giải thích ở
    // rematchUnmatchedLogs().
    await this.rematchUnmatchedLogs();
    return saved;
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

    // Gắn thêm tên user TRÊN MÁY (từ cache) cho MỌI log - không chỉ log
    // CHƯA khớp - để UI (tab "Logs chấm công") không bao giờ phải hiện trơ
    // mã UID, kể cả khi cần fallback hiển thị tên máy cho log đã khớp.
    const allDeviceUserIds = Array.from(new Set(data.map((l) => l.deviceUserId)));
    const deviceNameByUserId = await this.getDeviceUserNameMap(allDeviceUserIds);
    const enriched = data.map((log) => ({
      ...log,
      deviceUserName: deviceNameByUserId.get(log.deviceUserId) ?? null,
    }));

    return { data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Tra tên user TRÊN MÁY (từ cache, không gọi trực tiếp máy) cho 1 danh
   * sách deviceUserId - dùng ở getAttendanceLogs()/getAttendanceSummary() để
   * hiển thị tên thay vì trơ mã UID cho các log CHƯA map với nhân viên hệ
   * thống. Trả về Map rỗng nếu danh sách rỗng (tránh query DB thừa).
   */
  private async getDeviceUserNameMap(deviceUserIds: string[]): Promise<Map<string, string>> {
    if (deviceUserIds.length === 0) return new Map();
    const cached = await this.deviceUserCacheRepo.find({
      where: {
        deviceSerialNumber: this.deviceSerial,
        deviceUserId: In(deviceUserIds),
      },
    });
    return new Map(cached.map((c) => [c.deviceUserId, c.name]));
  }

  // Giờ vào chuẩn / giờ tan ca chuẩn của công ty, theo giờ Việt Nam (GMT+7).
  private static readonly WORK_START_MINUTES = 9 * 60; // 09:00 - sau mốc này mới tính đi muộn
  private static readonly WORK_END_MINUTES = 18 * 60; // 18:00 - trước mốc này mới tính về sớm

  /**
   * ⚠️ Bug thực tế đã phát hiện: máy chấm công đôi khi sinh ra NHIỀU dòng log
   * trải dài tới hàng chục phút chỉ cho ĐÚNG 1 LƯỢT "có mặt" thật của nhân
   * viên (vd cảm biến đọc lại/retry, người dùng quẹt lại vì đèn báo không rõ,
   * hoặc đứng gần máy quẹt nhầm nhiều lần trong lúc chờ). Ví dụ THẬT lấy trực
   * tiếp từ máy (nhân viên mã 44, cùng 1 buổi):
   *   16:19:54 → 16:27:41 → 16:27:46 → 17:06:20
   * Toàn bộ 4 lượt quẹt này cách nhau chưa tới 1 tiếng, rõ ràng là CÙNG 1 lượt
   * có mặt bị nhân bản (không có chuyện ra rồi vào lại 4 lần trong 47 phút).
   *
   * Ngưỡng cũ (2 PHÚT) chỉ gộp được cặp 16:27:41/16:27:46 (cách 5 giây) - còn
   * 16:19:54 và 17:06:20 vẫn bị tính là 2 mốc riêng biệt -> hệ thống hiểu
   * nhầm 16:19:54 = giờ vào, 17:06:20 = giờ ra -> ra "ca làm" dài 46 phút, gắn
   * cờ "về sớm" hoàn toàn vô lý -> đây chính là nguyên nhân UI hiển thị chấm
   * công rất lệch mà không phải do sai giờ (giờ mỗi dòng log đã đúng, đã xác
   * nhận qua CSV đối chiếu - decode-device-time.util.ts hoạt động đúng).
   *
   * => Nới ngưỡng lên 2 TIẾNG: các lượt quẹt liên tiếp CÙNG 1 nhân viên cách
   * nhau dưới 2 tiếng được coi là 1 lượt có mặt duy nhất (giữ lại lượt quẹt
   * ĐẦU TIÊN của cụm). Một ca làm việc thật (vào buổi sáng, ra cuối ngày)
   * luôn cách nhau nhiều hơn 2 tiếng nên KHÔNG bị gộp nhầm; chỉ những lượt
   * quẹt sát nhau bất thường trong cùng 1 lần "có mặt" mới bị gộp. Đánh đổi
   * đã biết: nếu công ty có quy trình quẹt ra/vào ăn trưa cách nhau DƯỚI 2
   * tiếng, buổi trưa đó sẽ bị gộp chung với buổi sáng (không tách được nghỉ
   * trưa) - chấp nhận được vì hệ thống hiện chưa có khái niệm "nhiều ca/ngày".
   * CHỈ áp dụng cho bảng tổng hợp (getAttendanceSummary) - KHÔNG xoá/ẩn dữ
   * liệu thô ở getAttendanceLogs()/bảng attendance_logs, để vẫn giữ nguyên
   * lịch sử quẹt thật phục vụ tra soát khi cần.
   */
  private static readonly DUPLICATE_TAP_GAP_MS = 2 * 60 * 60 * 1000; // 2 tiếng

  /**
   * Bảng chấm công tổng hợp theo ngày: mỗi dòng = 1 nhân viên trong 1 ngày,
   * gộp từ nhiều lượt quẹt thô trong attendance_logs.
   * - Giờ vào = lượt quẹt SỚM NHẤT trong ngày (giờ VN), sau khi đã gộp các
   *   lượt quẹt liên tiếp quá gần nhau (xem DUPLICATE_TAP_GAP_MS ở trên).
   * - Giờ ra = lượt quẹt MUỘN NHẤT trong ngày (giờ VN) - chỉ tính nếu ngày đó
   *   có từ 2 lượt quẹt (đã gộp trùng) trở lên (1 lượt duy nhất không đủ để
   *   suy ra giờ ra thật, tránh báo sai "về sớm" khi thực ra chỉ là thiếu
   *   quẹt ra).
   * - Đi muộn: giờ vào > 09:00. Về sớm: giờ ra < 18:00 (từ 18:00 trở đi luôn
   *   tính đúng giờ, không có khái niệm "về muộn").
   * Việc gộp/tính toán làm ở tầng ứng dụng (không dùng CONVERT_TZ của MySQL)
   * để không phụ thuộc session timezone của DB, luôn đúng theo giờ VN.
   */
  async getAttendanceSummary(query: QueryAttendanceSummaryDto) {
    const { page = 1, limit = 31, userId, from, to } = query;
    const { WORK_START_MINUTES, WORK_END_MINUTES, DUPLICATE_TAP_GAP_MS } =
      ZkDeviceService;

    const qb = this.attendanceLogRepo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.matchedUser', 'matchedUser')
      .orderBy('log.recordTime', 'ASC');

    // ⚠️ Trước đây có `.where('log.matchedUserId IS NOT NULL')` ở đây - chỉ
    // tổng hợp log ĐÃ khớp nhân viên hệ thống. Bỏ điều kiện này: log của
    // user CHƯA map (matchedUserId NULL) giờ vẫn được tổng hợp, chỉ khác là
    // nhóm theo deviceUserId thay vì matchedUserId (xem groupKey bên dưới) -
    // để admin nhìn thấy NGAY có bao nhiêu người đang chấm công nhưng chưa
    // được map, thay vì biến mất hoàn toàn khỏi bảng tổng hợp.
    if (userId) {
      qb.andWhere('log.matchedUserId = :userId', { userId });
    }
    // Lọc theo ngày VN -> recordTime giờ được lưu NGUYÊN VĂN giờ VN (không
    // offset - xem decode-device-time.util.ts), nên chỉ cần parse thẳng
    // chuỗi "YYYY-MM-DDTHH:mm:ss" KHÔNG kèm hậu tố timezone nào.
    if (from) {
      qb.andWhere('log.recordTime >= :from', {
        from: new Date(`${from}T00:00:00`),
      });
    }
    if (to) {
      qb.andWhere('log.recordTime <= :to', {
        to: new Date(`${to}T23:59:59`),
      });
    }

    const logs = await qb.getMany();

    // Tên user TRÊN MÁY (từ cache) cho MỌI deviceUserId xuất hiện trong log -
    // không chỉ user CHƯA map: user ĐÃ map cũng cần tên này để UI hiển thị
    // phụ đề "(tên trên máy)" dưới tên nhân viên hệ thống (yêu cầu từ tab
    // "Tổng hợp chấm công" - vd "Admin" kèm "(TuanIT)" bên dưới).
    const allDeviceUserIds = Array.from(new Set(logs.map((l) => l.deviceUserId)));
    const deviceNameByUserId = await this.getDeviceUserNameMap(allDeviceUserIds);

    type DayGroup = {
      // userId = null nghĩa là group này thuộc 1 deviceUserId CHƯA map với
      // nhân viên hệ thống nào - xem isMapped/deviceUserId bên dưới.
      userId: number | null;
      userName: string;
      isMapped: boolean;
      deviceUserId: string;
      // Tên user đăng ký TRÊN MÁY (từ cache) - có giá trị cho CẢ user đã map
      // lẫn chưa map (khác `userName`: với user đã map, `userName` là tên hệ
      // thống, còn field này luôn là tên trên máy, dùng làm phụ đề ở UI).
      // null nếu cache chưa có tên (vd user đã bị xoá khỏi máy từ trước).
      deviceUserName: string | null;
      date: string;
      checkIn: Date;
      checkOut: Date;
      logCount: number;
    };
    const groups = new Map<string, DayGroup>();

    // logs đã ORDER BY recordTime ASC ở query -> chỉ cần nhớ lượt quẹt được
    // GIỮ LẠI gần nhất của TỪNG groupKey (nhân viên đã map HOẶC deviceUserId
    // chưa map) để so khoảng cách, không cần sort lại theo từng người.
    // ⚠️ groupKey = 'u<matchedUserId>' cho log đã map, 'd<deviceUserId>' cho
    // log CHƯA map - KHÔNG dùng chung 1 namespace số nguyên như trước (chỉ
    // matchedUserId), để nhiều deviceUserId chưa map khác nhau không bị gộp
    // nhầm vào cùng 1 nhóm.
    const lastKeptTapByGroup = new Map<string, Date>();

    for (const log of logs) {
      const groupKey = log.matchedUserId
        ? `u${log.matchedUserId}`
        : `d${log.deviceUserId}`;

      const lastKept = lastKeptTapByGroup.get(groupKey);
      if (lastKept && log.recordTime.getTime() - lastKept.getTime() < DUPLICATE_TAP_GAP_MS) {
        // Quẹt liên tiếp quá gần lượt trước đó của CHÍNH người/mã này -> coi
        // là quẹt lặp/retry của cùng 1 lần chấm công, KHÔNG tính thêm - xem
        // giải thích DUPLICATE_TAP_GAP_MS ở trên.
        continue;
      }
      lastKeptTapByGroup.set(groupKey, log.recordTime);

      // recordTime đã là giờ VN nguyên văn (local getter) - lấy ngày trực
      // tiếp, KHÔNG qua toISOString()/offset nào (xem decode-device-time.util.ts).
      const dateKey = `${log.recordTime.getFullYear()}-${String(log.recordTime.getMonth() + 1).padStart(2, '0')}-${String(log.recordTime.getDate()).padStart(2, '0')}`;
      const key = `${groupKey}_${dateKey}`;
      const existing = groups.get(key);
      if (!existing) {
        const isMapped = !!log.matchedUserId;
        groups.set(key, {
          userId: log.matchedUserId ?? null,
          userName: isMapped
            ? (log.matchedUser?.name ?? '(Không rõ tên)')
            : (deviceNameByUserId.get(log.deviceUserId) ?? `UID ${log.deviceUserId}`),
          isMapped,
          deviceUserId: log.deviceUserId,
          deviceUserName: deviceNameByUserId.get(log.deviceUserId) ?? null,
          date: dateKey,
          checkIn: log.recordTime,
          checkOut: log.recordTime,
          logCount: 1,
        });
      } else {
        if (log.recordTime < existing.checkIn) existing.checkIn = log.recordTime;
        if (log.recordTime > existing.checkOut) existing.checkOut = log.recordTime;
        existing.logCount++;
      }
    }

    // recordTime đã là giờ VN nguyên văn -> đọc thẳng local getter, KHÔNG
    // qua offset/UTC nào (xem decode-device-time.util.ts).
    const minutesOfDayVN = (d: Date) => d.getHours() * 60 + d.getMinutes();

    const results = Array.from(groups.values())
      .map((g) => {
        const hasCheckout = g.logCount > 1;
        const isLate = minutesOfDayVN(g.checkIn) > WORK_START_MINUTES;
        const isEarlyLeave = hasCheckout && minutesOfDayVN(g.checkOut) < WORK_END_MINUTES;

        let status: 'on_time' | 'late' | 'early_leave' | 'late_and_early' | 'missing_checkout';
        if (!hasCheckout) status = 'missing_checkout';
        else if (isLate && isEarlyLeave) status = 'late_and_early';
        else if (isLate) status = 'late';
        else if (isEarlyLeave) status = 'early_leave';
        else status = 'on_time';

        const workHours = hasCheckout
          ? Math.round(((g.checkOut.getTime() - g.checkIn.getTime()) / 3600000) * 100) / 100
          : null;

        return {
          userId: g.userId,
          userName: g.userName,
          isMapped: g.isMapped,
          deviceUserId: g.deviceUserId,
          deviceUserName: g.deviceUserName,
          date: g.date,
          checkIn: g.checkIn,
          checkOut: hasCheckout ? g.checkOut : null,
          workHours,
          isLate,
          isEarlyLeave: hasCheckout ? isEarlyLeave : false,
          status,
          logCount: g.logCount,
        };
      })
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          Number(b.isMapped) - Number(a.isMapped) || // đã map hiện trước, chưa map dồn xuống dưới
          a.userName.localeCompare(b.userName),
      );

    const total = results.length;
    const data = results.slice((page - 1) * limit, (page - 1) * limit + limit);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // Số lần thử lại tối đa khi fetch từ máy bị thiếu/lỗi giữa chừng (xem giải
  // thích SYNC_RETRY_DELAY_MS bên dưới). Đặt vừa phải để không vượt quá thời
  // gian chạy tối đa của Vercel serverless function.
  private static readonly MAX_SYNC_ATTEMPTS = 4;
  private static readonly SYNC_RETRY_DELAY_MS = 2000;

  /**
   * Đồng bộ toàn bộ log chấm công từ máy về DB.
   * An toàn để gọi lặp lại nhiều lần: nhờ ràng buộc UNIQUE
   * (device_serial_number, user_sn) trên bảng attendance_logs,
   * log đã tồn tại sẽ tự bị bỏ qua (INSERT IGNORE), không nhân đôi dữ liệu.
   *
   * ⚠️ BUG THẬT ĐÃ PHÁT HIỆN: thư viện `node-zklib` có 1 timeout CỨNG 10 giây
   * cho MỖI gói dữ liệu nhận về (xem zklibtcp.js). Nếu 1 gói tới chậm hơn 10s
   * - hoàn toàn có thể xảy ra khi server (Vercel, ở xa) gọi qua IP public
   * port-forward từ router thay vì LAN nội bộ - thư viện KHÔNG throw lỗi, mà
   * âm thầm trả về `{ data: <phần đã nhận được>, err: Error }`. Code cũ chỉ
   * đọc `.data`, không hề kiểm tra `.err` -> sync "thành công" nhưng thiếu
   * data mà không ai biết (đúng triệu chứng: local 9976 log, production có
   * lúc chỉ 3273, có lúc 9820, không cố định).
   *
   * Cách sửa: gọi `zk.getInfo()` lấy `logCounts` (số log THẬT SỰ đang có trên
   * máy - nguồn đối chiếu tuyệt đối, không suy luận), rồi lặp lại việc fetch
   * (tối đa MAX_SYNC_ATTEMPTS lần, mỗi lần dùng 1 kết nối MỚI) cho tới khi
   * fetch đủ số lượng khớp `logCounts` VÀ không có `err` - đảm bảo production
   * luôn lấy đủ dữ liệu y hệt local trước khi coi là xong.
   */
  async syncNow(): Promise<SyncSummary> {
    if (this.isSyncing) {
      throw new Error('Đang có 1 lượt đồng bộ khác chạy, vui lòng thử lại sau.');
    }
    this.isSyncing = true;
    const startedAt = new Date();

    try {
      // Khớp lại các log cũ đang NULL trước, phòng trường hợp mapping vừa đổi
      // (unmap/map lại) kể từ lần đồng bộ trước - xem rematchUnmatchedLogs().
      await this.rematchUnmatchedLogs();

      // Bước 1: hỏi máy "tổng cộng có bao nhiêu log" - đây là con số THẬT,
      // dùng để biết fetch sau đó có bị thiếu hay không, KHÔNG suy đoán.
      let expectedLogCount: number | null = null;
      try {
        const zkInfo = this.createClient();
        try {
          await zkInfo.createSocket();
          const info = await zkInfo.getInfo();
          expectedLogCount = info?.logCounts ?? null;
        } finally {
          await this.safeDisconnect(zkInfo);
        }
      } catch (err) {
        // Không lấy được getInfo() cũng không sao - vẫn tiếp tục sync bình
        // thường, chỉ là mất khả năng đối chiếu đủ/thiếu (partialFetch sẽ chỉ
        // còn dựa vào cờ `err` của getAttendances(), không dựa được vào số đếm).
        this.logger.warn(`Không lấy được getInfo() để đối chiếu: ${(err as Error).message}`);
      }

      let deviceUsers: DeviceUser[] = [];
      let records: DeviceAttendanceRecord[] = [];
      let partialFetch = false;
      let fetchWarning: string | null = null;
      let attempt = 0;

      for (attempt = 1; attempt <= ZkDeviceService.MAX_SYNC_ATTEMPTS; attempt++) {
        const zk = this.createClient();
        try {
          await zk.createSocket();

          const usersResult = await zk.getUsers();
          deviceUsers = usersResult?.data ?? [];
          await this.upsertDeviceUserCache(deviceUsers);

          const logsResult = await zk.getAttendances((received: number, total: number) => {
            if (total > 0 && received % 1000 === 0) {
              this.logger.debug(`[Lần ${attempt}] Đang tải log: ${received}/${total}`);
            }
          });
          records = logsResult?.data ?? [];

          const hasLibError = !!logsResult?.err;
          const countMismatch =
            expectedLogCount != null && records.length < expectedLogCount;

          if (!hasLibError && !countMismatch) {
            partialFetch = false;
            fetchWarning = null;
            break; // Fetch đủ, không cần thử lại nữa
          }

          partialFetch = true;
          fetchWarning = hasLibError
            ? `Lỗi khi nhận dữ liệu từ máy: ${logsResult.err.message}`
            : `Chỉ nhận được ${records.length}/${expectedLogCount} log máy báo có`;
          this.logger.warn(
            `[Lần ${attempt}/${ZkDeviceService.MAX_SYNC_ATTEMPTS}] Fetch chưa đủ: ${fetchWarning}`,
          );
        } catch (err) {
          partialFetch = true;
          fetchWarning = (err as Error).message;
          this.logger.warn(
            `[Lần ${attempt}/${ZkDeviceService.MAX_SYNC_ATTEMPTS}] Lỗi kết nối: ${fetchWarning}`,
          );
        } finally {
          await this.safeDisconnect(zk);
        }

        if (attempt < ZkDeviceService.MAX_SYNC_ATTEMPTS) {
          // Nghỉ 1 nhịp trước khi thử lại - tránh dí liên tục vào máy ngay
          // sau khi vừa timeout (dễ làm máy càng phản hồi chậm hơn).
          await new Promise((r) => setTimeout(r, ZkDeviceService.SYNC_RETRY_DELAY_MS));
        }
      }

      this.logger.log(
        partialFetch
          ? `⚠️ Sync xong sau ${attempt} lần thử NHƯNG VẪN CÓ THỂ THIẾU DATA: ${fetchWarning}`
          : `Đọc được ${records.length} log chấm công từ máy (khớp kỳ vọng ${expectedLogCount ?? '(không rõ)'}) sau ${attempt} lần thử.`,
      );

      const mappedUsers = await this.userRepo.find({
        where: { zkDeviceUserId: Not(IsNull()) },
        select: ['id', 'zkDeviceUserId'],
      });
      const userIdByDeviceUserId = new Map(
        mappedUsers.map((u) => [u.zkDeviceUserId as string, u.id]),
      );

      const unmatchedSet = new Set<string>();
      let insertedNew = 0;
      let matchedToUser = 0;
      let invalidTimeCount = 0;

      const CHUNK_SIZE = 500;
      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        const values = chunk
          .map((rec) => {
            const matchedUserId = userIdByDeviceUserId.get(rec.deviceUserId) ?? null;
            if (matchedUserId) {
              matchedToUser++;
            } else {
              unmatchedSet.add(rec.deviceUserId);
            }

            // ⚠️ KHÔNG dùng `new Date(rec.recordTime)` trực tiếp - Date do
            // node-zklib trả về lệch giờ nếu server không chạy GMT+7 (bug đã
            // phát hiện qua test-connection.ts). Phải giải mã lại đúng 6 con
            // số máy đã ghi rồi LƯU NGUYÊN VĂN (không quy đổi UTC nào cả -
            // xem decode-device-time.util.ts để hiểu vì sao đây là cách đúng
            // và không phụ thuộc múi giờ server).
            let recordTime: Date;
            try {
              recordTime = decodeDeviceLocalTime(rec.recordTime).vnLocalDate;
            } catch {
              invalidTimeCount++;
              return null; // dòng log hỏng ở tầng giao thức -> bỏ qua, không làm crash cả lượt sync
            }

            return {
              deviceSerialNumber: this.deviceSerial,
              deviceUserId: rec.deviceUserId,
              userSn: rec.userSn,
              recordTime,
              matchedUserId,
              source: AttendanceSource.DEVICE_PULL,
            };
          })
          .filter((v): v is NonNullable<typeof v> => v !== null);

        if (values.length === 0) continue;

        const result = await this.attendanceLogRepo
          .createQueryBuilder()
          .insert()
          .into(AttendanceLog)
          .values(values)
          .orIgnore() // INSERT IGNORE - bỏ qua record đã có (trùng unique key)
          // ⚠️ FIX BUG: mặc định TypeORM cố ghi lại các cột do DB tự sinh
          // (ở đây là `synced_at` - CreateDateColumn) NGƯỢC LẠI vào từng object
          // trong `values` sau khi insert. Với MySQL, khi insert HÀNG LOẠT
          // (nhiều dòng/1 câu lệnh) + INSERT IGNORE, MySQL driver CHỈ trả về
          // đúng 1 `insertId` (dòng đầu tiên được chèn) - không có insertId
          // riêng cho từng dòng. TypeORM cố map lại id cho từng dòng, dòng nào
          // không map được id -> ném lỗi "Cannot update entity because entity
          // id is not set in the entity." (chính là lỗi 503 gặp phải). Tắt cơ
          // chế ghi-lại-vào-entity này vì ta không cần nó (chỉ cần đếm số dòng
          // insert thành công qua affectedRows bên dưới, không cần id trả về).
          .updateEntity(false)
          .execute();

        // ⚠️ KHÔNG dùng result.identifiers (luôn rỗng vì đã tắt updateEntity ở
        // trên, và trước đây cũng không đáng tin với bulk INSERT IGNORE).
        // `raw.affectedRows` của mysql2 driver với INSERT IGNORE CHỈ đếm đúng
        // số dòng THẬT SỰ được insert (dòng bị bỏ qua do trùng key KHÔNG được
        // tính) - đây là hành vi chuẩn của MySQL, dùng số này là chính xác
        // 100%, không còn là "ước lượng" như trước.
        insertedNew += result.raw?.affectedRows ?? 0;
      }

      if (invalidTimeCount > 0) {
        this.logger.warn(
          `Có ${invalidTimeCount} dòng log không giải mã được giờ (NaN) - đã bỏ qua, không ghi vào DB.`,
        );
      }

      const finishedAt = new Date();
      const summary: SyncSummary = {
        startedAt,
        finishedAt,
        totalFetchedFromDevice: records.length,
        expectedLogCount,
        partialFetch,
        fetchAttempts: attempt,
        fetchWarning,
        insertedNew,
        matchedToUser,
        unmatchedDeviceUserIds: Array.from(unmatchedSet),
        invalidTimeCount,
      };

      this.logger.log(
        `Đồng bộ xong: fetched=${summary.totalFetchedFromDevice}, insertedNew~=${summary.insertedNew}, matched=${summary.matchedToUser}, unmatchedUsers=${summary.unmatchedDeviceUserIds.length}, partialFetch=${partialFetch}`,
      );

      return summary;
    } finally {
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

        // Máy gửi dateTime dạng "YYYY-MM-DD HH:mm:ss" - đây LÀ giờ Việt Nam
        // thật (đã xác nhận qua đối chiếu CSV), KHÔNG cần và KHÔNG được gắn
        // thêm hậu tố "+07:00"/"Z" nào - parse trực tiếp để 6 con số đó trở
        // thành các thành phần "local" của Date, giữ nguyên nguyên tắc đối
        // xứng local-constructor/local-getter (xem decode-device-time.util.ts).
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
      // Cùng lý do như syncNow(): tắt updateEntity để tránh lỗi "Cannot update
      // entity because entity id is not set" khi máy gửi BÙ nhiều dòng ATTLOG
      // trong 1 lần POST (sau khi mất mạng) -> đây là insert hàng loạt, dính
      // đúng bug TypeORM + MySQL + INSERT IGNORE đã giải thích ở syncNow().
      .updateEntity(false)
      .execute();

    // affectedRows của MySQL với INSERT IGNORE chỉ đếm dòng THẬT SỰ mới insert.
    const insertedCount = result.raw?.affectedRows ?? 0;
    this.logger.log(
      `[ADMS Push] SN=${deviceSerialNumber}: nhận ${lines.length} dòng, ghi mới ~${insertedCount}.`,
    );
    return insertedCount;
  }
}