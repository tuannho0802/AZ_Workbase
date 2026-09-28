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

/** `lock_note` của lần khoá TỰ ĐỘNG (Task quá ân hạn) - nhận diện khoá tự động (kèm `locked_by_id IS NULL`)
 * để tự mở lại khi Task được kéo dài kỳ. */
export const AUTO_LOCK_NOTE = 'Tự động khoá: quá hạn kỳ hơn 7 ngày (ân hạn) mà chưa hoàn thành';
