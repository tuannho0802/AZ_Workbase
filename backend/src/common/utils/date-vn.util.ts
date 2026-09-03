export function getNowVn(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
}

export function todayVnStr(): string {
  const now = getNowVn();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isFutureDateVn(dateToVerify: Date | string): boolean {
  if (!dateToVerify) return false;

  const date = new Date(dateToVerify);
  if (isNaN(date.getTime())) return false;

  const nowVn = getNowVn();
  nowVn.setHours(23, 59, 59, 999);

  return date.getTime() > nowVn.getTime();
}

export type ReportPeriodType = 'week' | 'month' | 'quarter' | 'year' | 'custom';

export interface DateRange {
  /** 00:00:00.000 ngày bắt đầu (giờ VN) */
  start: Date;
  /** 23:59:59.999 ngày kết thúc (giờ VN) */
  end: Date;
}

/**
 * Tính khoảng ngày TRỌN VẸN theo lịch (Thứ Hai->Chủ Nhật cho tuần, ngày
 * 1->ngày cuối cho tháng, v.v.) chứa `anchor` - KHÔNG PHẢI "N ngày gần đây
 * tính từ hôm nay" (yêu cầu nghiệp vụ đã chốt rõ: "Sẽ tính theo kiểu lấy
 * mốc 1 tuần trước (1 tuần trọn vẹn)... thay vì lấy 30 hoặc 31 ngày tính từ
 * ngày hiện tại").
 *
 * Dùng cho Báo cáo doanh số (revenue/customer report) - `period=custom` bỏ
 * qua `anchor`, dùng thẳng `customFrom`/`customTo` (cũng ép về full-day
 * boundary cho nhất quán).
 *
 * Tuần tính theo ISO (Thứ Hai là ngày đầu tuần) - quy ước phổ biến trong
 * môi trường doanh nghiệp VN, khác với `Date.getDay()` mặc định (Chủ Nhật=0).
 */
export function getReportPeriodRange(
  period: ReportPeriodType,
  anchor: Date = getNowVn(),
  customFrom?: string,
  customTo?: string,
): DateRange {
  if (period === 'custom') {
    if (!customFrom || !customTo) {
      throw new Error('period=custom bắt buộc phải có customFrom và customTo');
    }
    const start = new Date(`${customFrom}T00:00:00`);
    const end = new Date(`${customTo}T23:59:59.999`);
    return { start, end };
  }

  const y = anchor.getFullYear();
  const m = anchor.getMonth(); // 0-based

  if (period === 'week') {
    // getDay(): CN=0, T2=1, ..., T7=6 -> quy đổi để Thứ Hai luôn là đầu tuần
    const dow = anchor.getDay();
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
  }

  if (period === 'month') {
    const start = new Date(y, m, 1, 0, 0, 0, 0);
    const end = new Date(y, m + 1, 0, 23, 59, 59, 999); // ngày 0 của tháng sau = ngày cuối tháng này
    return { start, end };
  }

  if (period === 'quarter') {
    const quarterStartMonth = Math.floor(m / 3) * 3;
    const start = new Date(y, quarterStartMonth, 1, 0, 0, 0, 0);
    const end = new Date(y, quarterStartMonth + 3, 0, 23, 59, 59, 999);
    return { start, end };
  }

  // period === 'year'
  const start = new Date(y, 0, 1, 0, 0, 0, 0);
  const end = new Date(y, 11, 31, 23, 59, 59, 999);
  return { start, end };
}