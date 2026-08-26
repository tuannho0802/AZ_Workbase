/**
 * sequential-attendance-reader.util.ts
 * -----------------------------------------------------------------
 * ⚠️ QUAN TRỌNG - ĐỌC KỸ TRƯỚC KHI SỬA
 *
 * VẤN ĐỀ ĐÃ XÁC NHẬN: `node-zklib` (`zklibtcp.js`, hàm `readWithBuffer`)
 * khi log chấm công lớn hơn 1 chunk (>MAX_CHUNK=65472 byte, tức máy có
 * khoảng >1636 record - máy thật của mình có ~9948 record => luôn rơi vào
 * trường hợp này), thư viện gửi TẤT CẢ các lệnh xin chunk (`CMD_DATA_RDY`)
 * CÙNG LÚC trong 1 vòng lặp `for`, KHÔNG chờ phản hồi của chunk trước rồi
 * mới xin chunk sau:
 *
 *   for (let i = 0; i <= numberChunks; i++) {
 *     sendChunkRequest(...)   // bắn liên tiếp, không await, không chờ
 *   }
 *
 * Qua LAN nội bộ (độ trễ thấp, không mất gói) việc này chạy tốt. Nhưng khi
 * server (Vercel, ở xa) gọi qua IP public port-forward từ router tại nhà -
 * độ trễ cao + có thể mất gói giữa chừng - việc bắn 7 chunk liên tiếp không
 * kiểm soát khiến 1-2 gói cuối bị nghẽn/rớt, và vì thư viện gốc chỉ có ĐÚNG
 * 1 timeout dùng chung cho TOÀN BỘ quá trình nhận (không có retry riêng cho
 * từng chunk lẻ), khi 1 chunk bị rớt, cả lượt fetch dừng khựng lại ở đúng 1
 * điểm cố định - khớp 100% với triệu chứng thực tế đã quan sát được (local
 * ~9976 log, production có lúc chỉ 3273, có lúc 9820, không cố định - luôn
 * là 1 số nhỏ hơn hoặc bằng tổng, không bao giờ vượt).
 *
 * CÁCH SỬA (file này): đọc TUẦN TỰ - xin xong 1 chunk, đợi nhận ĐỦ dữ liệu
 * chunk đó (có timeout + retry RIÊNG cho từng chunk), rồi mới xin chunk kế
 * tiếp. Chậm hơn cách bắn hết 1 lần, nhưng đáng tin cậy hơn nhiều qua kết
 * nối WAN chập chờn - đúng yêu cầu "không cần nhanh, chỉ cần chắc chắn đủ
 * dữ liệu" của production.
 *
 * NGUYÊN TẮC THIẾT KẾ: TÁI SỬ DỤNG TRỰC TIẾP mọi hàm mã hoá/giải mã nhị
 * phân đã có sẵn và được export công khai từ `node-zklib/utils.js` và
 * `node-zklib/constants.js` (`createTCPHeader`, `decodeTCPHeader`,
 * `checkNotEventTCP`, `decodeRecordData40`, `COMMANDS`, `REQUEST_DATA`,
 * `MAX_CHUNK`) - CHỈ thay đổi phần "gửi chunk nào, khi nào" (flow control),
 * KHÔNG tự viết lại phần giao thức nhị phân để tránh sai lệch dù chỉ 1 byte
 * so với bản gốc đã được xác nhận hoạt động đúng qua LAN.
 *
 * Đã đối chiếu kết quả byte-for-byte với `zk.getAttendances()` gốc qua
 * script `npm run zk:test-sequential` (test-sequential.ts, chạy qua LAN)
 * TRƯỚC KHI đưa vào `ZkDeviceService.syncNow()` - xem file đó để biết cách
 * tự chạy lại kiểm chứng nếu có sửa đổi ở đây trong tương lai.
 */

import type { Socket } from 'net';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  createTCPHeader,
  decodeTCPHeader,
  checkNotEventTCP,
  decodeRecordData40,
} = require('node-zklib/utils');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { COMMANDS, REQUEST_DATA, MAX_CHUNK } = require('node-zklib/constants');

const RECORD_PACKET_SIZE = 40;

// Rộng rãi hơn timeout 10s "cứng" của node-zklib gốc - đường WAN chậm hơn
// LAN nhiều, cần chấp nhận độ trễ cao hơn TRƯỚC KHI coi là mất gói thật sự.
// Cho phép override qua tham số (mặc định giữ nguyên) - phục vụ viết test tự
// động (giả lập "mất gói" mà không phải chờ thật 15s mỗi lần chạy test).
const DEFAULT_CHUNK_TIMEOUT_MS = 15000;

// Số lần thử lại CHO 1 CHUNK LẺ khi timeout/mất gói - độc lập với retry ở
// tầng ZkDeviceService.syncNow() (retry cả LƯỢT sync, tốn kém hơn nhiều vì
// phải tạo lại kết nối + phiên làm việc từ đầu). Retry ở đây rẻ hơn: chỉ
// xin lại đúng chunk bị thiếu, giữ nguyên phiên kết nối hiện tại.
const DEFAULT_CHUNK_MAX_RETRIES = 3;
const DEFAULT_CHUNK_RETRY_DELAY_MS = 500;

/** Tham số tinh chỉnh tuỳ chọn - KHÔNG truyền gì thì hành vi y hệt trước đây. */
export interface SequentialReadOptions {
  chunkTimeoutMs?: number;
  chunkMaxRetries?: number;
  chunkRetryDelayMs?: number;
}

export interface SequentialReadProgress {
  receivedBytes: number;
  totalBytes: number;
}

export interface SequentialAttendanceRecord {
  userSn: number;
  deviceUserId: string;
  // Xem decode-device-time.util.ts - Date này giữ nguyên 6 con số máy đã
  // ghi dưới dạng "local" (giống hệt hành vi decodeRecordData40 gốc của
  // node-zklib) - KHÔNG tự quy đổi gì thêm ở file này.
  recordTime: Date;
  ip: string;
}

/**
 * Gửi 1 lệnh CMD_DATA_RDY xin đúng [start, size) byte tiếp theo - giống hệt
 * `sendChunkRequest()` private của zklibtcp.js gốc, chỉ khác là ta tự gọi
 * cho TỪNG chunk một, có kiểm soát chờ đợi, thay vì để thư viện tự bắn hết.
 */
function sendChunkRequest(zklibTcp: any, start: number, size: number): void {
  zklibTcp.replyId++;
  const reqData = Buffer.alloc(8);
  reqData.writeUInt32LE(start, 0);
  reqData.writeUInt32LE(size, 4);
  const buf = createTCPHeader(
    COMMANDS.CMD_DATA_RDY,
    zklibTcp.sessionId,
    zklibTcp.replyId,
    reqData,
  );
  zklibTcp.socket.write(buf);
}

/**
 * Chờ nhận ĐỦ dữ liệu cho ĐÚNG 1 chunk đã xin (đã gửi request trước đó bằng
 * `sendChunkRequest`). Logic ghép buffer TỪNG PHẦN (`totalBuffer`) rồi tách
 * lấy đúng phần payload (`realTotalBuffer`) COPY Y HỆT state machine trong
 * `readWithBuffer()` gốc của zklibtcp.js - vì TCP là stream byte liên tục,
 * 1 chunk vẫn có thể đến qua NHIỀU sự kiện 'data' riêng lẻ (do MTU/độ trễ
 * mạng), không phải cứ 1 lần 'data' là trọn vẹn 1 chunk.
 *
 * Khác biệt duy nhất so với bản gốc: được SCOPE riêng cho 1 chunk (không
 * dùng chung state với các chunk khác), có timeout RIÊNG, và listener được
 * gỡ (`removeListener`) ngay khi xong - không rò rỉ qua các lần gọi kế tiếp.
 */
function receiveOneChunk(socket: Socket, expectedSize: number, timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let totalBuffer = Buffer.from([]);
    let realTotalBuffer = Buffer.from([]);
    let settled = false;
    let timer: NodeJS.Timeout;

    const cleanup = () => {
      clearTimeout(timer);
      socket.removeListener('data', onData);
      socket.removeListener('close', onClose);
    };

    const settleReject = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const settleResolve = (buf: Buffer) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(buf);
    };

    const armTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        settleReject(
          new Error(
            `Timeout khi chờ chunk (đã nhận ${realTotalBuffer.length}/${expectedSize} byte)`,
          ),
        );
      }, timeoutMs);
    };

    const onClose = () => {
      settleReject(new Error('Socket bị ngắt đột ngột khi đang chờ chunk'));
    };

    const onData = (data: Buffer) => {
      if (settled) return;
      // Bỏ qua sự kiện real-time (vd có người quẹt thẻ đúng lúc đang sync) -
      // giống hệt kiểm tra `checkNotEventTCP` trong bản gốc.
      if (checkNotEventTCP(data)) return;

      armTimer();
      totalBuffer = Buffer.concat([totalBuffer, data]);

      // Khung 8 byte đầu: 4 byte prefix (0x50 0x50 0x82 0x7d) + 2 byte
      // packetLength + 2 byte reserved - xem createTCPHeader() gốc.
      if (totalBuffer.length < 8) return; // chưa đủ để đọc packetLength, đợi thêm dữ liệu
      const packetLength = totalBuffer.readUIntLE(4, 2);

      if (totalBuffer.length >= 8 + packetLength) {
        // Bỏ 8 byte khung ngoài + 8 byte header lệnh bên trong (16 byte),
        // lấy đúng phần payload - giống hệt `subarray(16, 8+packetLength)` gốc.
        realTotalBuffer = Buffer.concat([
          realTotalBuffer,
          totalBuffer.subarray(16, 8 + packetLength),
        ]);
        totalBuffer = totalBuffer.subarray(8 + packetLength);

        if (realTotalBuffer.length === expectedSize + 8) {
          settleResolve(realTotalBuffer.subarray(8));
        }
      }
    };

    armTimer();
    socket.on('data', onData);
    socket.once('close', onClose);
  });
}

/**
 * Xin + chờ 1 chunk, TỰ ĐỘNG xin lại (gửi lại đúng request [start,size) cũ)
 * tối đa CHUNK_MAX_RETRIES lần nếu timeout/mất gói - đây chính là phần
 * "retry riêng cho từng chunk lẻ" mà bản gốc của node-zklib không có.
 */
async function fetchOneChunkWithRetry(
  zklibTcp: any,
  start: number,
  size: number,
  opts: Required<SequentialReadOptions>,
): Promise<Buffer> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= opts.chunkMaxRetries; attempt++) {
    try {
      sendChunkRequest(zklibTcp, start, size);
      return await receiveOneChunk(zklibTcp.socket, size, opts.chunkTimeoutMs);
    } catch (err) {
      lastErr = err as Error;
      if (attempt < opts.chunkMaxRetries) {
        await new Promise((r) => setTimeout(r, opts.chunkRetryDelayMs));
      }
    }
  }
  throw new Error(
    `Không tải được chunk [start=${start}, size=${size}] sau ${opts.chunkMaxRetries} lần thử: ${lastErr?.message}`,
  );
}

/**
 * Đọc TOÀN BỘ log chấm công từ máy, tuần tự từng chunk (xem giải thích ở
 * đầu file). Thay thế trực tiếp cho `zklibTcp.getAttendances()` gốc -
 * `zklibTcp` truyền vào PHẢI đã `createSocket()` + kết nối thành công (lấy
 * từ `(new ZKLib(...)).zklibTcp` sau khi gọi `zk.createSocket()`).
 *
 * @throws Error nếu bất kỳ chunk nào thất bại sau khi đã retry hết -
 * KHÔNG trả về dữ liệu thiếu âm thầm như bản gốc (`{ data, err }`) - để
 * tầng gọi (ZkDeviceService.syncNow()) quyết định có nên retry cả lượt
 * sync hay không dựa trên exception này.
 */
export async function readAttendanceLogsSequential(
  zklibTcp: any,
  onProgress?: (p: SequentialReadProgress) => void,
  options?: SequentialReadOptions,
): Promise<SequentialAttendanceRecord[]> {
  if (!zklibTcp?.socket) {
    throw new Error('zklibTcp.socket chưa kết nối - phải gọi zk.createSocket() trước');
  }
  const opts: Required<SequentialReadOptions> = {
    chunkTimeoutMs: options?.chunkTimeoutMs ?? DEFAULT_CHUNK_TIMEOUT_MS,
    chunkMaxRetries: options?.chunkMaxRetries ?? DEFAULT_CHUNK_MAX_RETRIES,
    chunkRetryDelayMs: options?.chunkRetryDelayMs ?? DEFAULT_CHUNK_RETRY_DELAY_MS,
  };

  // Bước 1: dọn buffer phiên cũ trên máy - giống hệt getAttendances() gốc
  // (đảm bảo máy không còn "nhớ" 1 yêu cầu đọc dữ liệu dở dang trước đó).
  await zklibTcp.freeData();

  // Bước 2: gửi lệnh khởi tạo yêu cầu đọc log chấm công - TÁI SỬ DỤNG
  // `requestData()` công khai của zklibTcp (round-trip đơn, chưa có logic
  // chunk) - giống hệt bước đầu của `readWithBuffer()` gốc.
  zklibTcp.replyId++;
  const initBuf = createTCPHeader(
    COMMANDS.CMD_DATA_WRRQ,
    zklibTcp.sessionId,
    zklibTcp.replyId,
    REQUEST_DATA.GET_ATTENDANCE_LOGS,
  );
  const initReply: any = await zklibTcp.requestData(initBuf);
  const initHeader = decodeTCPHeader(initReply.subarray(0, 16));

  let replyData: Buffer = Buffer.from([]);

  if (initHeader.commandId === COMMANDS.CMD_DATA) {
    // Dữ liệu đủ nhỏ, máy trả thẳng trong 1 gói duy nhất - không cần xin
    // thêm chunk nào (trường hợp máy có rất ít log, hiếm gặp với máy thật).
    replyData = initReply.subarray(16);
    onProgress?.({ receivedBytes: replyData.length, totalBytes: replyData.length });
  } else if (
    initHeader.commandId === COMMANDS.CMD_ACK_OK ||
    initHeader.commandId === COMMANDS.CMD_PREPARE_DATA
  ) {
    const recvData: any = initReply.subarray(16);
    const totalSize = recvData.readUIntLE(1, 4);

    const remain = totalSize % MAX_CHUNK;
    const numberChunks = Math.round(totalSize - remain) / MAX_CHUNK;

    // ⚠️ Giữ NGUYÊN bound `i <= numberChunks` giống hệt vòng lặp gốc
    // (KHÔNG tối ưu/bỏ bớt vòng lặp cuối dù remain=0, dù trường hợp này gần
    // như không xảy ra với dữ liệu thật) - để hành vi khớp 100% với bản gốc
    // đã xác nhận chạy đúng qua LAN, tránh tự tạo ra sai khác không cần thiết.
    for (let i = 0; i <= numberChunks; i++) {
      const isLastChunk = i === numberChunks;
      const start = isLastChunk ? numberChunks * MAX_CHUNK : i * MAX_CHUNK;
      const size = isLastChunk ? remain : MAX_CHUNK;

      const chunkPayload = await fetchOneChunkWithRetry(zklibTcp, start, size, opts);
      replyData = Buffer.concat([replyData, chunkPayload]);
      onProgress?.({ receivedBytes: replyData.length, totalBytes: totalSize });
    }
  } else {
    throw new Error(
      `Phản hồi bất thường khi bắt đầu đọc log chấm công (commandId=${initHeader.commandId})`,
    );
  }

  // Bước 3: dọn buffer phiên sau khi đọc xong - giống hệt getAttendances() gốc.
  await zklibTcp.freeData();

  // Bước 4: giải mã - TÁI SỬ DỤNG decodeRecordData40 gốc của node-zklib, bỏ
  // 4 byte đầu (đếm số record) giống hệt getAttendances() gốc.
  let recordData = replyData.subarray(4);
  const records: SequentialAttendanceRecord[] = [];
  while (recordData.length >= RECORD_PACKET_SIZE) {
    const record = decodeRecordData40(recordData.subarray(0, RECORD_PACKET_SIZE));
    records.push({ ...record, ip: zklibTcp.ip });
    recordData = recordData.subarray(RECORD_PACKET_SIZE);
  }

  return records;
}