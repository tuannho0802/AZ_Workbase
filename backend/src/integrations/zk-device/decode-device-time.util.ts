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
 *
 * ⚠️ BUG THẬT ĐÃ PHÁT HIỆN (26/08) - LỚP THỨ 2, RIÊNG BIỆT VỚI PIPELINE Ở
 * TRÊN: nguyên tắc "local getter/constructor" ở trên chỉ đúng cho pipeline
 * NỘI BỘ trong 1 tiến trình (decode -> lưu DB -> đọc lại DB), KHÔNG tự động
 * đúng khi giá trị `Date` này bị SERIALIZE RA JSON để trả qua API HTTP.
 * `JSON.stringify(date)`/`res.json({checkIn: date})` LUÔN gọi
 * `Date.prototype.toJSON()` -> `.toISOString()` (chuẩn UTC, luôn có hậu tố
 * "Z") - bước này ĐỌC EPOCH THẬT của Date (không phải "local getter"), mà
 * epoch thật lại phụ thuộc múi giờ tiến trình lúc constructor chạy (xem giải
 * thích ở trên). Kết quả: cùng 1 giá trị "09:16" máy báo, backend chạy ở máy
 * dev đặt múi giờ VN sẽ trả ra JSON "...T02:16:00Z" (lùi 7h), còn backend
 * chạy trên Vercel (mặc định UTC) trả ra JSON "...T09:16:00Z" (giữ nguyên số).
 * Frontend (`dayjs(value)` không có `.utc()`) thấy hậu tố "Z" sẽ tự quy đổi
 * UTC -> giờ trình duyệt (VN, +7h) khi format - với giá trị từ máy dev VN,
 * 2 lần lệch (backend lùi 7h, frontend tiến 7h) TÌNH CỜ triệt tiêu nhau nên
 * "trông có vẻ đúng"; với giá trị từ Vercel, chỉ còn ĐÚNG 1 lần lệch (frontend)
 * -> lộ ra sai +7h y hệt triệu chứng "Đi trễ (+422 phút)" đã gặp. Đã tái hiện
 * bằng thực nghiệm (Node với TZ=UTC vs TZ=Asia/Ho_Chi_Minh) trước khi sửa.
 *
 * => SỬA: KHÔNG bao giờ để 1 `Date` object mang ý nghĩa "giờ VN naive" (kiểu
 * `vnLocalDate` ở dưới, hoặc bất kỳ Date nào đọc thẳng từ cột `record_time`)
 * bị serialize ra API qua con đường JSON.stringify() mặc định. Luôn format
 * tường minh bằng `toNaiveApiString()` (hàm mới thêm dưới đây) THÀNH CHUỖI
 * KHÔNG có hậu tố "Z"/offset nào trước khi trả ra response - để frontend
 * (`dayjs(chuỗi)` không có "Z") parse thẳng làm giờ local, không tự quy đổi
 * gì thêm - đối xứng ĐÚNG với cách `new Date("YYYY-MM-DD HH:mm:ss")` (không
 * "Z") luôn được V8 hiểu là giờ local bất kể tiến trình chạy múi giờ gì (đã
 * verify thực nghiệm) - nhờ vậy khớp đúng dù chạy ở local hay production,
 * không còn phụ thuộc TZ hệ điều hành của bất kỳ máy nào ở cả 2 đầu.
 */

export interface DecodedDeviceTime {
  /** Chuỗi hiển thị DD/MM/YYYY HH:mm:ss - giờ máy đã ghi, dùng để log/CSV/đối chiếu. */
  vnLocalDisplay: string;
  /**
   * Date object mang ĐÚNG 6 con số máy đã ghi ở dạng "local" (xem giải thích
   * ở đầu file) - đây là giá trị DUY NHẤT dùng để ghi vào cột `recordTime`
   * (DATETIME). KHÔNG gọi .toISOString()/.getUTCHours() trên giá trị này.
   * KHÔNG trả trực tiếp giá trị này (hay bất kỳ Date nào đọc lại từ cột
   * `record_time`) ra API - luôn đi qua `toNaiveApiString()` trước (xem cảnh
   * báo BUG LỚP 2 ở đầu file).
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

/**
 * Format 1 `Date` đang mang "6 con số giờ VN naive" (đọc bằng local getter -
 * `vnLocalDate` ở trên, hoặc bất kỳ Date nào TypeORM trả về từ cột
 * `record_time`/tương đương) thành chuỗi "YYYY-MM-DDTHH:mm:ss" - CỐ TÌNH
 * KHÔNG có hậu tố "Z"/offset nào - để trả ra API JSON an toàn.
 *
 * DÙNG HÀM NÀY (không phải trả thẳng object `Date`) ở MỌI response API có
 * field mang ý nghĩa "giờ VN của máy chấm công" (`checkIn`/`checkOut` của
 * getAttendanceSummary(), `recordTime` của getAttendanceLogs()...) - xem giải
 * thích đầy đủ ở cảnh báo BUG LỚP 2 đầu file. KHÔNG dùng cho các Date mang ý
 * nghĩa "mốc thời gian thật" khác (vd `syncedAt`/`startedAt`/`finishedAt` -
 * những field này được tạo bằng `new Date()` thường, epoch của chúng vốn đã
 * đúng thật, serialize UTC bình thường qua .toISOString() không có vấn đề gì).
 */
export function toNaiveApiString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}