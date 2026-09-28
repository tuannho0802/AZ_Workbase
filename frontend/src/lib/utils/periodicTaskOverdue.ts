import dayjs from 'dayjs';
import type { PeriodicTask } from '@/lib/api/periodic-tasks.api';
import { getNowVn } from '@/lib/utils/date-vn';

/** Ân hạn (ngày) sau `periodEndDate` trước khi hiệu suất TỰ ĐỘNG coi là quá hạn - khớp `LATE_GRACE_DAYS` ở BE. */
export const LATE_GRACE_DAYS = 7;

/** Mã status coi là đã xong phần việc - khớp `COMPLETED_STATUS_CODES` ở BE. */
const COMPLETED_STATUS_CODES = ['in_review', 'done'];

export const todayVnYmd = (): string => dayjs(getNowVn()).format('YYYY-MM-DD');

const isCompleted = (task: Pick<PeriodicTask, 'status'>): boolean =>
  COMPLETED_STATUS_CODES.includes(task.status?.code ?? '');

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

/** Task QUÁ HẠN để hiện cờ / lọc "Chỉ Task quá hạn": đã qua deadline kỳ và chưa in_review/done.
 * Khớp điều kiện `overdueOnly` ở BE (`getUserTasks`). Độc lập với ân hạn 7 ngày của hiệu suất. */
export const isTaskOverdue = (
  task: Pick<PeriodicTask, 'periodEndDate' | 'status'>,
  today = todayVnYmd(),
): boolean => !isCompleted(task) && isPastPeriodEnd(task, today);

/** Số ngày đã quá hạn (>= 1 khi `isTaskOverdue`), 0 nếu chưa quá hạn. */
export const getOverdueDays = (task: Pick<PeriodicTask, 'periodEndDate'>, today = todayVnYmd()): number =>
  Math.max(0, dayjs(today).diff(dayjs(endYmd(task)), 'day'));
