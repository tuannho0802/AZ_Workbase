import dayjs, { Dayjs } from 'dayjs';
import type { LeaveCalendarItem } from '../api/leave-requests.api';

export type LeaveCalendarStatus = LeaveCalendarItem['status'];

export const LEAVE_CALENDAR_STATUS_LABELS: Record<LeaveCalendarStatus, { text: string; color: string }> = {
  pending: { text: 'Chờ duyệt', color: 'warning' },
  approved: { text: 'Đã duyệt', color: 'success' },
  rejected: { text: 'Từ chối', color: 'error' },
};

const STATUS_ORDER: Record<LeaveCalendarStatus, number> = { approved: 0, pending: 1, rejected: 2 };

/**
 * Khoảng ngày xin BE cho 1 tháng đang xem: cả tháng + dư 7 ngày mỗi đầu để phủ các ô
 * của tháng trước/sau hiện trên lưới (không phụ thuộc tuần bắt đầu T2 hay CN).
 * Tối đa 31 + 14 = 45 ngày - đúng trần BE (CALENDAR_MAX_DAYS).
 */
export function getCalendarFetchRange(month: Dayjs): { fromDate: string; toDate: string } {
  return {
    fromDate: month.startOf('month').subtract(7, 'day').format('YYYY-MM-DD'),
    toDate: month.endOf('month').add(7, 'day').format('YYYY-MM-DD'),
  };
}

/** Index NGÀY (YYYY-MM-DD) -> đơn phủ ngày đó; mỗi ngày sắp Đã duyệt -> Chờ duyệt -> Từ chối, rồi theo tên. */
export function indexLeavesByDate(items: LeaveCalendarItem[]): Map<string, LeaveCalendarItem[]> {
  const map = new Map<string, LeaveCalendarItem[]>();
  for (const it of items) {
    let cursor = dayjs(String(it.startDate).slice(0, 10));
    const end = dayjs(String(it.endDate).slice(0, 10));
    let guard = 0; // chặn vòng lặp vô hạn nếu dữ liệu lỗi (end < start)
    while (!cursor.isAfter(end, 'day') && guard < 400) {
      const key = cursor.format('YYYY-MM-DD');
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
      cursor = cursor.add(1, 'day');
      guard += 1;
    }
  }
  for (const arr of map.values()) {
    arr.sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        (a.requester?.name ?? '').localeCompare(b.requester?.name ?? '', 'vi') ||
        a.id - b.id,
    );
  }
  return map;
}

/** Số người KHÁC NHAU + số đơn có ngày nghỉ rơi vào tháng đang xem (đã áp bộ lọc trạng thái). */
export function summarizeMonth(items: LeaveCalendarItem[], month: Dayjs): { requests: number; people: number } {
  const start = month.startOf('month');
  const end = month.endOf('month');
  const inMonth = items.filter(
    (it) => !dayjs(String(it.endDate).slice(0, 10)).isBefore(start, 'day') && !dayjs(String(it.startDate).slice(0, 10)).isAfter(end, 'day'),
  );
  return { requests: inMonth.length, people: new Set(inMonth.map((it) => it.requester?.id ?? `r${it.id}`)).size };
}

export function leaveDurationLabel(it: Pick<LeaveCalendarItem, 'duration' | 'periodStartTime' | 'periodEndTime'>): string {
  const base = it.duration === 'half_day_am' ? 'Nửa ngày (Sáng)' : it.duration === 'half_day_pm' ? 'Nửa ngày (Chiều)' : 'Cả ngày';
  if (it.periodStartTime && it.periodEndTime) {
    return `${base} · ${it.periodStartTime.slice(0, 5)} - ${it.periodEndTime.slice(0, 5)}`;
  }
  return base;
}

/** Hậu tố ngắn trên Tag: S = sáng, C = chiều (cả ngày không có hậu tố). */
export function leaveDurationSuffix(duration: LeaveCalendarItem['duration']): string {
  return duration === 'half_day_am' ? ' (S)' : duration === 'half_day_pm' ? ' (C)' : '';
}
