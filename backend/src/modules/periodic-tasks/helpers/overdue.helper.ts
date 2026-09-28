import { addDaysToDateString } from './list-window.helper';

/** Mã status được coi là "đã xong phần việc" (đã đạt in_review/done) - khớp quy tắc hiệu suất. */
export const COMPLETED_STATUS_CODES = ['in_review', 'done'] as const;

/** Task đã QUA hạn kỳ (deadline = `period_end_date`) tính đến `today` (YYYY-MM-DD, giờ VN). */
export function isPastPeriodEnd(periodEndDate: string, today: string): boolean {
  return today > periodEndDate;
}

/**
 * Task CHƯA hoàn thành có bị coi là "quá hạn" không (dùng cho hiệu suất):
 *  - tự động: hôm nay > `period_end_date + graceDays`; hoặc
 *  - thủ công: có `overdueMarkedAt` VÀ đã qua `period_end_date` (dấu cũ mà Task đã được
 *    kéo dài kỳ thì không còn hiệu lực).
 */
export function isOverdueNotCompleted(
  periodEndDate: string,
  overdueMarkedAt: Date | string | null | undefined,
  today: string,
  graceDays: number,
): boolean {
  if (today > addDaysToDateString(periodEndDate, graceDays)) return true;
  return overdueMarkedAt != null && isPastPeriodEnd(periodEndDate, today);
}
