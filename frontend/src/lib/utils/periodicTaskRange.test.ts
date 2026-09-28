import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import {
  MAX_TASK_RANGE_DAYS,
  clampRange,
  getLastMonthRange,
  getLastWeekRange,
  getPerformanceQuickRange,
  getMonthRange,
  getThisWeekRange,
  getTodayRange,
  getThisMonthRange,
  rangeSpanDays,
} from './periodicTaskRange';

const f = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD');

describe('getThisWeekRange', () => {
  it('Thứ Năm -> Thứ 2 .. Chủ nhật cùng tuần', () => {
    const [a, b] = getThisWeekRange(dayjs('2026-09-24'));
    expect([f(a), f(b)]).toEqual(['2026-09-21', '2026-09-27']);
  });
  it('Chủ nhật thuộc tuần bắt đầu Thứ 2 trước đó', () => {
    const [a, b] = getThisWeekRange(dayjs('2026-09-27'));
    expect([f(a), f(b)]).toEqual(['2026-09-21', '2026-09-27']);
  });
  it('Thứ 2 -> chính nó là đầu tuần', () => {
    const [a] = getThisWeekRange(dayjs('2026-09-21'));
    expect(f(a)).toBe('2026-09-21');
  });
});

describe('getMonthRange', () => {
  it('cả tháng', () => {
    const [a, b] = getMonthRange(dayjs('2026-02-10'));
    expect([f(a), f(b)]).toEqual(['2026-02-01', '2026-02-28']);
  });
});

describe('getTodayRange', () => {
  it('đúng 1 ngày, cùng ngày với "now"', () => {
    const [a, b] = getTodayRange(dayjs('2026-09-24T15:30:00'));
    expect([f(a), f(b)]).toEqual(['2026-09-24', '2026-09-24']);
  });
});

describe('getThisMonthRange', () => {
  it('mirror getMonthRange với "now" mặc định', () => {
    const [a, b] = getThisMonthRange(dayjs('2026-02-10'));
    expect([f(a), f(b)]).toEqual(['2026-02-01', '2026-02-28']);
  });
});

describe('clampRange', () => {
  it('trong giới hạn -> giữ nguyên', () => {
    const r = clampRange(dayjs('2026-09-01'), dayjs('2026-09-30'));
    expect(r.clamped).toBe(false);
  });
  it('đúng giới hạn -> vẫn OK', () => {
    const from = dayjs('2026-01-01');
    expect(clampRange(from, from.add(MAX_TASK_RANGE_DAYS - 1, 'day')).clamped).toBe(false);
  });
  it('vượt giới hạn (vd Task Năm) -> cắt còn đúng giới hạn, giữ ngày bắt đầu', () => {
    const r = clampRange(dayjs('2026-01-01'), dayjs('2026-12-31'));
    expect(r.clamped).toBe(true);
    expect(f(r.range[0])).toBe('2026-01-01');
    expect(rangeSpanDays(r.range[0], r.range[1])).toBe(MAX_TASK_RANGE_DAYS);
  });
});

describe('getLastWeekRange / getLastMonthRange / preset lastWeek', () => {
  it('Tuần trước từ Thứ Hai đầu tuần -> Thứ 2..CN tuần liền trước', () => {
    const [a, b] = getLastWeekRange(dayjs('2026-09-28'));
    expect([f(a), f(b)]).toEqual(['2026-09-21', '2026-09-27']);
  });
  it('Tuần trước từ Chủ nhật -> vẫn là tuần liền trước tuần chứa CN', () => {
    const [a, b] = getLastWeekRange(dayjs('2026-09-27'));
    expect([f(a), f(b)]).toEqual(['2026-09-14', '2026-09-20']);
  });
  it('Tuần trước xuyên tháng/năm', () => {
    const [a, b] = getLastWeekRange(dayjs('2027-01-05'));
    expect([f(a), f(b)]).toEqual(['2026-12-28', '2027-01-03']);
  });
  it('Tháng trước ngày 31 không bị tràn (31/03 -> Tháng 2)', () => {
    const [a, b] = getLastMonthRange(dayjs('2026-03-31'));
    expect([f(a), f(b)]).toEqual(['2026-02-01', '2026-02-28']);
  });
  it('Tháng trước qua năm', () => {
    const [a, b] = getLastMonthRange(dayjs('2027-01-15'));
    expect([f(a), f(b)]).toEqual(['2026-12-01', '2026-12-31']);
  });
  it('getPerformanceQuickRange("lastWeek") dùng chung util', () => {
    const [a] = getPerformanceQuickRange('lastWeek', dayjs('2026-09-28'));
    expect(f(a)).toBe('2026-09-21');
  });
});
