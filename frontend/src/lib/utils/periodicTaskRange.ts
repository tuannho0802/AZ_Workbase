import dayjs, { Dayjs } from 'dayjs';

/**
 * Khoảng ngày của danh sách Công việc định kỳ - PHẢI khớp `list-window.helper.ts`
 * ở BE: danh sách KHÔNG BAO GIỜ tải toàn bộ, mặc định TUẦN NÀY (Thứ 2 -> Chủ nhật),
 * tối đa `MAX_TASK_RANGE_DAYS` ngày (BE trả 400 nếu vượt).
 */
export const MAX_TASK_RANGE_DAYS = 93;

export type DateRangeTuple = [Dayjs, Dayjs];

/** Tuần này: Thứ 2 00:00 -> Chủ nhật (không phụ thuộc locale dayjs). */
export function getThisWeekRange(now: Dayjs = dayjs()): DateRangeTuple {
  const monday = now.startOf('day').subtract((now.day() + 6) % 7, 'day');
  return [monday, monday.add(6, 'day').endOf('day')];
}

/** Cả tháng chứa `date`. */
export function getMonthRange(date: Dayjs): DateRangeTuple {
  return [date.startOf('month'), date.endOf('month')];
}

/** Số ngày (gồm cả 2 đầu) của khoảng. */
export function rangeSpanDays(from: Dayjs, to: Dayjs): number {
  return to.startOf('day').diff(from.startOf('day'), 'day') + 1;
}

/**
 * Ép khoảng về tối đa `MAX_TASK_RANGE_DAYS` ngày: giữ ngày bắt đầu, cắt ngày kết
 * thúc. `clamped=true` để nơi gọi báo cho người dùng biết.
 */
export function clampRange(from: Dayjs, to: Dayjs): { range: DateRangeTuple; clamped: boolean } {
  if (rangeSpanDays(from, to) <= MAX_TASK_RANGE_DAYS) return { range: [from, to], clamped: false };
  return { range: [from, from.add(MAX_TASK_RANGE_DAYS - 1, 'day').endOf('day')], clamped: true };
}
