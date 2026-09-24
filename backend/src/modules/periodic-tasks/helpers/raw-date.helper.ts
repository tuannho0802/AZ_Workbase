/**
 * Chuẩn hoá giá trị cột DATE lấy từ `getRawMany()`/`getRawOne()` về "YYYY-MM-DD".
 *
 * ⚠️ VÌ SAO CẦN: `getMany()` để TypeORM tự map cột `type: 'date'` về chuỗi, nhưng
 * `getRawMany()` trả THẲNG giá trị của driver mysql2 - mà mysql2 (không bật
 * `dateStrings`) trả cột DATE là đối tượng `Date` (nửa đêm theo timezone của
 * process Node). `String(date).slice(0, 10)` khi đó ra "Tue Sep 29" -> parse
 * ngày sai -> `RangeError: Invalid time value` (bug thật khi chạy local
 * 2026-09-24 ở `GET /periodic-tasks-performance/summary`). Spec cũ truyền
 * sẵn chuỗi 'YYYY-MM-DD' nên không bắt được lỗi này.
 *
 * Dùng getter LOCAL (không phải UTC) vì mysql2 dựng `Date` từ cột DATE bằng
 * `new Date(y, m, d)` theo timezone process - đúng cách `DateUtils.mixedDateToDateString`
 * của TypeORM xử lý.
 */
export function rawDateToYmd(value: Date | string): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}
