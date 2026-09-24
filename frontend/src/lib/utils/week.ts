import type { Dayjs } from 'dayjs';

/**
 * Trả về đầu tuần (Thứ 2, 00:00) của ngày `d`. KHÔNG dùng plugin `isoWeek`
 * của dayjs - xem ghi chú ở `PeriodSelector.tsx` ("picker=week dễ lệch nếu
 * locale/plugin isoWeek khác giả định") - tự tính tay bằng `.day()`
 * (0=CN...6=T7) để không phụ thuộc locale/plugin phải extend đúng chỗ.
 * Dùng chung cho `WeekGroupedRequests` và `WeeklyCollapseSection`.
 */
export function getWeekStart(d: Dayjs): Dayjs {
  const day = d.day();
  const diff = day === 0 ? -6 : 1 - day;
  return d.add(diff, 'day').startOf('day');
}
