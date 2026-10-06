import dayjs from 'dayjs';
import type { PeriodicTask } from '@/lib/api/periodic-tasks.api';
import { getNowVn } from '@/lib/utils/date-vn';

/** Ân hạn (ngày) sau `periodEndDate` trước khi hiệu suất TỰ ĐỘNG coi là quá hạn - khớp `LATE_GRACE_DAYS` ở BE. */
export const LATE_GRACE_DAYS = 7;

/** Mã status coi là đã xong phần việc - khớp `COMPLETED_STATUS_CODES` ở BE. */
const COMPLETED_STATUS_CODES = ['in_review', 'done', 'completed'];

/** Quá hạn (cờ UI + lọc) khi hôm nay >= `periodEndDate` + N ngày - khớp `OVERDUE_AFTER_DAYS` ở BE (trước đây N = 1). */
export const OVERDUE_AFTER_DAYS = 3;

export const todayVnYmd = (): string => dayjs(getNowVn()).format('YYYY-MM-DD');

const isCompleted = (task: Pick<PeriodicTask, 'status'>): boolean =>
  task.status?.isDoneState === true || COMPLETED_STATUS_CODES.includes(task.status?.code ?? '');

const endYmd = (task: Pick<PeriodicTask, 'periodEndDate'>): string => String(task.periodEndDate).slice(0, 10);

/** Task đã QUA hạn kỳ (deadline = `periodEndDate`). Đúng ngày cuối kỳ thì CHƯA quá hạn. */
export const isPastPeriodEnd = (task: Pick<PeriodicTask, 'periodEndDate'>, today = todayVnYmd()): boolean =>
  today > endYmd(task);

/**
 * Hiện nút "Đánh dấu quá hạn": đã qua deadline, chưa xong, chưa đánh dấu, và còn TRONG ân hạn
 * (hết ân hạn hiệu suất đã tự tính quá hạn nên đánh dấu tay không còn tác dụng).
 */
export const canMarkOverdue = (
  task: Pick<PeriodicTask, 'periodEndDate' | 'status' | 'overdueMarkedAt'>,
  today = todayVnYmd(),
): boolean => {
  if (task.overdueMarkedAt || isCompleted(task) || !isPastPeriodEnd(task, today)) return false;
  return today <= dayjs(endYmd(task)).add(LATE_GRACE_DAYS, 'day').format('YYYY-MM-DD');
};

/** Dấu thủ công đang có hiệu lực (hiện Tag "Quá hạn"): đã đánh dấu + còn quá hạn kỳ + chưa xong. */
export const isManualOverdueActive = (
  task: Pick<PeriodicTask, 'periodEndDate' | 'status' | 'overdueMarkedAt'>,
  today = todayVnYmd(),
): boolean => !!task.overdueMarkedAt && !isCompleted(task) && isPastPeriodEnd(task, today);

/** Cho phép "Gỡ quá hạn" khi Task đang mang dấu (kể cả khi dấu đã hết hiệu lực vì kéo dài kỳ - để dọn dữ liệu). */
export const canUnmarkOverdue = (task: Pick<PeriodicTask, 'overdueMarkedAt'>): boolean => !!task.overdueMarkedAt;

/** Task QUÁ HẠN để hiện cờ / lọc "Chỉ Task quá hạn": đã quá deadline kỳ `OVERDUE_AFTER_DAYS` ngày và chưa xong.
 * Khớp điều kiện `overdueOnly` ở BE (`getUserTasks`). Độc lập với ân hạn 7 ngày của hiệu suất. */
export const isTaskOverdue = (
  task: Pick<PeriodicTask, 'periodEndDate' | 'status'>,
  today = todayVnYmd(),
): boolean => !isCompleted(task) && today >= dayjs(endYmd(task)).add(OVERDUE_AFTER_DAYS, 'day').format('YYYY-MM-DD');

/** Số ngày tính từ deadline kỳ (>= OVERDUE_AFTER_DAYS khi `isTaskOverdue`), 0 nếu chưa qua deadline. */
export const getOverdueDays = (task: Pick<PeriodicTask, 'periodEndDate'>, today = todayVnYmd()): number =>
  Math.max(0, dayjs(today).diff(dayjs(endYmd(task)), 'day'));
