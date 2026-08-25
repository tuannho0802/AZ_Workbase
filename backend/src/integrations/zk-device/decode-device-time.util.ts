/**
 * decode-device-time.util.ts
 * -----------------------------------------------------------------
 * ⚠️ QUAN TRỌNG - ĐỌC KỸ TRƯỚC KHI SỬA
 *
 * QUYẾT ĐỊNH THIẾT KẾ (đã xác nhận qua đối chiếu CSV với giờ quẹt thẻ thật):
 * Máy chấm công ghi ĐÚNG giờ Việt Nam - không có lệch múi giờ nào ở tầng
 * thiết bị. Vì vậy KHÔNG áp dụng bất kỳ phép cộng/trừ giờ nào (không còn
 * "+07:00", không còn Date.UTC(...) - VN_OFFSET_MS như bản trước) - 6 con số
 * (năm/tháng/ngày/giờ/phút/giây) máy báo được coi là sự thật tuyệt đối và
 * được lưu NGUYÊN VĂN vào DB (cột `record_time` kiểu DATETIME - xem migration
 * đi kèm, KHÔNG dùng TIMESTAMP vì MySQL tự quy đổi TIMESTAMP theo session
 * timezone, sẽ làm lệch lại đúng những gì ta vừa cố tránh).
 *
 * VẤN ĐỀ KỸ THUẬT CẦN GIẢI QUYẾT (vì sao không thể chỉ new Date() đơn giản):
 * `node-zklib` (utils.js, `parseTimeToDate`) parse dữ liệu nhị phân rồi gọi
 * `new Date(year, month, day, hour, minute, second)` - CONSTRUCTOR ĐA THAM SỐ
 * của Date, luôn được JS diễn giải các con số đó là "giờ ĐỊA PHƯƠNG CỦA TIẾN
 * TRÌNH NODE ĐANG CHẠY" (KHÔNG có khái niệm UTC nào ở bước này). Trên server
 * chạy múi giờ khác GMT+7 (vd Vercel mặc định UTC), object Date này có epoch
 * (mốc UTC thật) SAI - NHƯNG các "local getter" của nó
 * (getFullYear/getMonth/getDate/getHours/getMinutes/getSeconds) vẫn LUÔN trả
 * lại ĐÚNG 6 con số gốc, bất kể tiến trình chạy múi giờ gì - vì constructor
 * "local" và getter "local" luôn đối xứng nhau trong CÙNG 1 tiến trình.
 *
 * => NGUYÊN TẮC BẮT BUỘC xuyên suốt cả file này lẫn nơi dùng nó
 * (`ZkDeviceService`): CHỈ dùng local getter/constructor
 * (`new Date(y,m,d,h,mi,s)`, `.getFullYear()`, `.getHours()`...).
 * TUYỆT ĐỐI KHÔNG dùng bất kỳ hàm/thuộc tính UTC nào
 * (`.toISOString()`, `.getUTCHours()`, `Date.UTC(...)`, hậu tố "+07:00"/"Z"
 * khi parse string) cho pipeline `recordTime` - trộn lẫn 2 kiểu sẽ tạo ra
 * đúng loại lệch giờ đã từng xảy ra trước đây. Khi ghi Date object này vào
 * cột DATETIME (không dùng option `timezone` cho driver mysql2 - đã xác nhận
 * `database.config.ts` không cấu hình), driver mặc định format Date bằng
 * local getter - nên 6 con số gốc sống sót nguyên vẹn qua toàn bộ pipeline,
 * không phụ thuộc máy chạy code (dev/Vercel) đặt múi giờ gì.
 *
 * Dùng chung cho `integrations/zk-device/test-connection.ts` (script test
 * tay) và `modules/zk-device/zk-device.service.ts` (`syncNow()`, nguồn
 * DEVICE_PULL) để 2 nơi không lệch logic với nhau.
 */

export interface DecodedDeviceTime {
  /** Chuỗi hiển thị DD/MM/YYYY HH:mm:ss - giờ máy đã ghi, dùng để log/CSV/đối chiếu. */
  vnLocalDisplay: string;
  /**
   * Date object mang ĐÚNG 6 con số máy đã ghi ở dạng "local" (xem giải thích
   * ở đầu file) - đây là giá trị DUY NHẤT dùng để ghi vào cột `recordTime`
   * (DATETIME). KHÔNG gọi .toISOString()/.getUTCHours() trên giá trị này.
   */
  vnLocalDate: Date;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Giải mã lại đúng 6 con số giờ máy đã ghi từ 1 `Date` object do node-zklib
 * (`zk.getAttendances()`) trả về, KHÔNG phụ thuộc múi giờ của tiến trình Node
 * đang chạy, KHÔNG áp dụng offset nào. Xem giải thích chi tiết ở đầu file.
 *
 * @throws Error nếu Date đầu vào không hợp lệ (log hỏng ở tầng giao thức)
 */
export function decodeDeviceLocalTime(zkDate: Date): DecodedDeviceTime {
  const y = zkDate.getFullYear();
  const mo = zkDate.getMonth(); // 0-based, khớp tham số thứ 2 của `new Date(...)`
  const d = zkDate.getDate();
  const h = zkDate.getHours();
  const mi = zkDate.getMinutes();
  const s = zkDate.getSeconds();

  if ([y, mo, d, h, mi, s].some((n) => Number.isNaN(n))) {
    throw new Error(
      'recordTime không hợp lệ (NaN) - dòng log này có thể bị hỏng ở tầng giao thức',
    );
  }

  const vnLocalDisplay = `${pad(d)}/${pad(mo + 1)}/${y} ${pad(h)}:${pad(mi)}:${pad(s)}`;
  // Dựng lại bằng constructor "local" - KHÔNG dùng Date.UTC() - để giữ đúng
  // nguyên tắc đối xứng local-constructor/local-getter giải thích ở đầu file.
  const vnLocalDate = new Date(y, mo, d, h, mi, s);

  return { vnLocalDisplay, vnLocalDate };
}