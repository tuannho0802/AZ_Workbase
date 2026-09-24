import { PeriodType } from '../../../common/enums/period-type.enum';
import { addDaysToDateString } from './list-window.helper';

/**
 * DeadlineReminderHelper - tính "ngày cần nhắc lúc 18:00 giờ VN" cho 1 Task
 * CHƯA hoàn thành, theo đúng chốt nghiệp vụ của chủ dự án:
 *
 *  - Weekly: nhắc trước 18:00 CỦA NGÀY TRƯỚC `period_end_date` 1 ngày.
 *  - Daily 1 ngày (period_start_date = period_end_date): nhắc trước 18:00
 *    CỦA CHÍNH ngày đó.
 *  - Daily nhiều ngày: nhắc vào NGÀY GIỮA của khoảng, theo đúng VÍ DỤ chủ dự
 *    án đưa ra ("có ngày 1,2,3 thì nhắc vào ngày 2" - `middleIndex =
 *    ceil(totalDays / 2)`, 1-based tính từ `period_start_date`).
 *
 * ⚠️ GHI CHÚ MÂU THUẪN CẦN CHỦ DỰ ÁN XÁC NHẬN LẠI (KHÔNG tự suy đoán thêm):
 * yêu cầu gốc viết "nếu là Task ngày mà có trên 3 ngày thì nhắc vào NGÀY
 * CUỐI CÙNG" nhưng ví dụ cụ thể đi kèm ("ngày 1,2,3 thì nhắc vào ngày 2") lại
 * là NGÀY GIỮA, không phải ngày cuối (ngày 3). Bản implement này ưu tiên
 * theo ĐÚNG VÍ DỤ cụ thể (ngày giữa) vì đó là dữ kiện rõ ràng nhất, áp dụng
 * THỐNG NHẤT cho MỌI Task Daily nhiều ngày (không chỉ riêng ">3 ngày" - áp
 * cả 2 ngày để tránh có 2 quy tắc khác nhau cho "đúng 2-3 ngày" so với "trên
 * 3 ngày" mà chủ dự án chưa nói rõ ranh giới). Nếu ý đồ thật là "ngày cuối
 * cùng" cho case >3 ngày, cần xác nhận lại và sửa hàm `computeReminderDate()`
 * bên dưới (chỉ 1 chỗ, không ảnh hưởng lịch nhắc Weekly/Daily 1-ngày).
 *
 * Monthly/Yearly: CHƯA có yêu cầu rõ ràng về mốc nhắc -> trả về `null` (cố
 * tình CHƯA nhắc, không tự bịa quy tắc).
 */
export interface ReminderableTask {
  periodType: PeriodType;
  /** YYYY-MM-DD */
  periodStartDate: string;
  /** YYYY-MM-DD */
  periodEndDate: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const toUtcMs = (s: string): number => new Date(`${s.slice(0, 10)}T00:00:00Z`).getTime();

/** Số ngày TRỌN VẸN giữa 2 mốc (bao gồm cả 2 đầu mút), tối thiểu 1. */
export function diffDaysInclusive(fromDateStr: string, toDateStr: string): number {
  const days = Math.round((toUtcMs(toDateStr) - toUtcMs(fromDateStr)) / DAY_MS) + 1;
  return Math.max(days, 1);
}

/**
 * Trả về ngày (YYYY-MM-DD, giờ VN) cần nhắc lúc 18:00 cho Task này, hoặc
 * `null` nếu `periodType` chưa có quy tắc nhắc (Monthly/Yearly).
 */
export function computeReminderDate(task: ReminderableTask): string | null {
  if (task.periodType === PeriodType.WEEKLY) {
    return addDaysToDateString(task.periodEndDate, -1);
  }

  if (task.periodType === PeriodType.DAILY) {
    const totalDays = diffDaysInclusive(task.periodStartDate, task.periodEndDate);
    if (totalDays <= 1) return task.periodEndDate;
    const middleIndex = Math.ceil(totalDays / 2); // 1-based, tính từ periodStartDate
    return addDaysToDateString(task.periodStartDate, middleIndex - 1);
  }

  return null;
}
