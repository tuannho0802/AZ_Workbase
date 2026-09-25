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

/** Hôm nay: 00:00 -> 23:59:59.999 cùng ngày. */
export function getTodayRange(now: Dayjs = dayjs()): DateRangeTuple {
  return [now.startOf('day'), now.endOf('day')];
}

/** Cả tháng chứa `date`. */
export function getMonthRange(date: Dayjs): DateRangeTuple {
  return [date.startOf('month'), date.endOf('month')];
}

/** Tháng này - tiện dùng làm preset nút bấm (mirror `getThisWeekRange`),
 * thực chất chỉ là `getMonthRange(now)` với `now` mặc định. */
export function getThisMonthRange(now: Dayjs = dayjs()): DateRangeTuple {
  return getMonthRange(now);
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

/** Nhãn hiển thị 1 khoảng Kỳ hạn Task (`periodStartDate`/`periodEndDate`),
 * gộp về 1 ngày khi trùng nhau (Task Ngày) - mirror ĐÚNG cách hiển thị đã có
 * ở `PerformanceFlaggedDrawer.tsx`, tách ra đây làm util CHUNG để tái dùng ở
 * `TaskLinksModal.tsx` (dropdown "Công việc con") mà không lặp lại logic. */
export function formatPeriodRange(t: { periodStartDate: string; periodEndDate: string }): string {
  return t.periodStartDate === t.periodEndDate
    ? dayjs(t.periodEndDate).format('DD/MM/YYYY')
    : `${dayjs(t.periodStartDate).format('DD/MM')} - ${dayjs(t.periodEndDate).format('DD/MM/YYYY')}`;
}
