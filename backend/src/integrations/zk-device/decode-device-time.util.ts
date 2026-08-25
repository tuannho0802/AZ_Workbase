/**
 * decode-device-time.util.ts
 * -----------------------------------------------------------------
 * ⚠️ QUAN TRỌNG - ĐỌC KỸ TRƯỚC KHI SỬA (bug đã xảy ra thật, gây lệch giờ
 * chấm công trên UI sản xuất):
 *
 * `node-zklib` (utils.js, hàm `parseTimeToDate`) giải mã giờ ghi trên máy
 * bằng `new Date(year, month, day, hour, minute, second)` - CONSTRUCTOR ĐA
 * THAM SỐ của Date, luôn được JS diễn giải theo MÚI GIỜ CỦA TIẾN TRÌNH NODE
 * ĐANG CHẠY, KHÔNG PHẢI giờ Việt Nam và KHÔNG PHẢI giờ của máy chấm công.
 * Máy chấm công chỉ trả về đúng 6 con số (năm/tháng/ngày/giờ/phút/giây) đọc
 * từ đồng hồ nội bộ của nó (đã cấu hình GMT+7) - không hề kèm thông tin múi
 * giờ nào cả.
 *
 * Hệ quả:
 * - Chạy trên máy/server đặt múi giờ Việt Nam (GMT+7) -> object Date do
 *   node-zklib trả về TÌNH CỜ đúng, vì "múi giờ tiến trình" trùng luôn với
 *   "múi giờ máy chấm công".
 * - Chạy trên server đặt múi giờ khác GMT+7 (vd server production mặc định
 *   chạy UTC) -> object Date bị SAI ngay tại bước giải mã, lệch đúng bằng
 *   chênh lệch múi giờ (UTC vs GMT+7 => lệch 7 tiếng) - đây CHÍNH LÀ nguyên
 *   nhân gây lệch giờ "chấm công rất lệch" trên UI khi backend chạy trên
 *   server không đặt GMT+7.
 *
 * => KHÔNG được tin thẳng `.toISOString()` / `.getTime()` của Date do
 * node-zklib trả về (nguồn DEVICE_PULL, qua `zk.getAttendances()`) cho bất
 * kỳ mục đích nào liên quan tới "giờ thật". Phải dùng các getter LOCAL
 * (getFullYear/getMonth/getDate/getHours/...) để lấy lại NGUYÊN VẸN 6 con
 * số gốc mà node-zklib đã đọc từ máy - việc này AN TOÀN & không phụ thuộc
 * múi giờ thật của tiến trình đang chạy, vì constructor "local" và getter
 * "local" luôn đối xứng nhau trong CÙNG 1 tiến trình (dù tiến trình chạy
 * múi giờ gì, cặp `new Date(Y,M,D,H,Mi,S)` + `.getFullYear()/.getHours()...`
 * luôn cho lại đúng Y,M,D,H,Mi,S ban đầu). Sau khi lấy lại đúng 6 con số,
 * coi chúng LÀ giờ Việt Nam (vì máy chấm công được cấu hình vậy) rồi tự quy
 * đổi sang UTC bằng cách trừ đúng 7 tiếng - CHÍNH XÁC cùng cách
 * `ZkDeviceService.ingestPushAttendance()` (luồng ADMS Push) đã làm đúng
 * từ trước; nguồn DEVICE_PULL (`syncNow()`) trước đây KHÔNG làm bước này
 * -> đây là chỗ đã sửa.
 *
 * Dùng chung cho cả `integrations/zk-device/test-connection.ts` (script
 * test tay) và `modules/zk-device/zk-device.service.ts` (`syncNow()`, luồng
 * DEVICE_PULL chính thức) để không bị lệch logic giữa 2 nơi.
 */

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // GMT+7, không có DST nên offset cố định

export interface DecodedDeviceTime {
  /** Chuỗi hiển thị DD/MM/YYYY HH:mm:ss - giờ máy đã ghi (giờ VN thật) */
  vnLocalDisplay: string;
  /** Instant UTC ĐÚNG, quy đổi từ giờ VN ở trên - dùng để so/ghi DB */
  correctUtcDate: Date;
  /** Cùng giá trị với correctUtcDate, ở dạng chuỗi ISO (tiện log/CSV) */
  correctUtcIso: string;
}

/**
 * Giải mã lại đúng giờ VN + UTC từ 1 `Date` object do node-zklib
 * (`zk.getAttendances()`) trả về, KHÔNG phụ thuộc múi giờ của tiến trình
 * Node đang chạy. Xem giải thích chi tiết ở đầu file.
 *
 * @throws Error nếu Date đầu vào không hợp lệ (log hỏng ở tầng giao thức)
 */
export function decodeDeviceLocalTime(zkDate: Date): DecodedDeviceTime {
  const y = zkDate.getFullYear();
  const mo = zkDate.getMonth(); // 0-based, khớp Date.UTC
  const d = zkDate.getDate();
  const h = zkDate.getHours();
  const mi = zkDate.getMinutes();
  const s = zkDate.getSeconds();

  if ([y, mo, d, h, mi, s].some((n) => Number.isNaN(n))) {
    throw new Error(
      'recordTime không hợp lệ (NaN) - dòng log này có thể bị hỏng ở tầng giao thức',
    );
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const vnLocalDisplay = `${pad(d)}/${pad(mo + 1)}/${y} ${pad(h)}:${pad(mi)}:${pad(s)}`;

  const correctUtcMs = Date.UTC(y, mo, d, h, mi, s) - VN_OFFSET_MS;
  const correctUtcDate = new Date(correctUtcMs);

  return { vnLocalDisplay, correctUtcDate, correctUtcIso: correctUtcDate.toISOString() };
}
