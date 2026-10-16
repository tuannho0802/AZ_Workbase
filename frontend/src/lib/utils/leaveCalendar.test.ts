import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import type { LeaveCalendarItem } from '../api/leave-requests.api';
import { getCalendarFetchRange, indexLeavesByDate, summarizeMonth, leaveDurationLabel, leaveDurationSuffix } from './leaveCalendar';

const item = (over: Partial<LeaveCalendarItem> = {}): LeaveCalendarItem => ({
  id: 1, leaveType: 'annual', status: 'approved', startDate: '2026-10-05', endDate: '2026-10-07', duration: 'full_day',
  totalDays: 3, periodStartTime: null, periodEndTime: null, reason: 'x', isSupplementary: false,
  requester: { id: 1, name: 'An', department: null }, ...over,
});

describe('leaveCalendar utils', () => {
  it('getCalendarFetchRange: cả tháng + dư 7 ngày mỗi đầu, không vượt 45 ngày', () => {
    const r = getCalendarFetchRange(dayjs('2026-10-16'));
    expect(r).toEqual({ fromDate: '2026-09-24', toDate: '2026-11-07' });
    const days = dayjs(r.toDate).diff(dayjs(r.fromDate), 'day') + 1;
    expect(days).toBeLessThanOrEqual(45);
    const long = getCalendarFetchRange(dayjs('2026-12-01'));
    expect(dayjs(long.toDate).diff(dayjs(long.fromDate), 'day') + 1).toBeLessThanOrEqual(45);
  });

  it('indexLeavesByDate: đơn nhiều ngày phủ MỌI ngày, đơn 1 ngày phủ đúng 1 ô', () => {
    const m = indexLeavesByDate([item(), item({ id: 2, startDate: '2026-10-06', endDate: '2026-10-06' })]);
    expect(m.get('2026-10-05')?.map((i) => i.id)).toEqual([1]);
    expect(m.get('2026-10-06')?.map((i) => i.id).sort()).toEqual([1, 2]);
    expect(m.get('2026-10-07')?.length).toBe(1);
    expect(m.get('2026-10-08')).toBeUndefined();
  });

  it('indexLeavesByDate: sắp Đã duyệt -> Chờ duyệt -> Từ chối rồi theo tên; chịu được ISO datetime', () => {
    const m = indexLeavesByDate([
      item({ id: 3, status: 'rejected', requester: { id: 3, name: 'Ba', department: null } }),
      item({ id: 2, status: 'pending', requester: { id: 2, name: 'Bình', department: null } }),
      item({ id: 1, status: 'approved', startDate: '2026-10-05T00:00:00.000Z', requester: { id: 1, name: 'An', department: null } }),
    ]);
    expect(m.get('2026-10-05')?.map((i) => i.status)).toEqual(['approved', 'pending', 'rejected']);
  });

  it('indexLeavesByDate: dữ liệu lỗi end < start không treo (không ô nào)', () => {
    expect(indexLeavesByDate([item({ startDate: '2026-10-09', endDate: '2026-10-01' })]).size).toBe(0);
  });

  it('summarizeMonth: đếm đơn + người khác nhau CHỈ trong tháng đang xem', () => {
    const items = [
      item(),
      item({ id: 2, startDate: '2026-10-20', endDate: '2026-10-20' }), // cùng người id=1
      item({ id: 3, requester: { id: 2, name: 'Bình', department: null }, startDate: '2026-09-28', endDate: '2026-10-01' }),
      item({ id: 4, startDate: '2026-11-02', endDate: '2026-11-03' }), // ngoài tháng
    ];
    expect(summarizeMonth(items, dayjs('2026-10-16'))).toEqual({ requests: 3, people: 2 });
  });

  it('leaveDurationLabel/Suffix', () => {
    expect(leaveDurationLabel({ duration: 'half_day_am', periodStartTime: null, periodEndTime: null })).toBe('Nửa ngày (Sáng)');
    expect(leaveDurationLabel({ duration: 'full_day', periodStartTime: '14:00:00', periodEndTime: '17:00:00' })).toBe('Cả ngày · 14:00 - 17:00');
    expect(leaveDurationSuffix('half_day_pm')).toBe(' (C)');
    expect(leaveDurationSuffix('full_day')).toBe('');
  });
});
