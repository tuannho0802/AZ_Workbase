import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { getWeekStart } from './week';

const fmt = (s: string) => getWeekStart(dayjs(s)).format('YYYY-MM-DD');

describe('getWeekStart', () => {
  it('Thứ 2 trả về chính nó', () => {
    expect(fmt('2026-09-21')).toBe('2026-09-21');
  });
  it('Giữa tuần (Thứ 5) lùi về Thứ 2', () => {
    expect(fmt('2026-09-24')).toBe('2026-09-21');
  });
  it('Chủ nhật thuộc tuần TRƯỚC (Thứ 2 cách đó 6 ngày)', () => {
    expect(fmt('2026-09-27')).toBe('2026-09-21');
  });
  it('Qua ranh giới tháng/năm', () => {
    expect(fmt('2026-01-01')).toBe('2025-12-29');
  });
  it('Reset giờ về 00:00', () => {
    expect(getWeekStart(dayjs('2026-09-24T18:30:00')).hour()).toBe(0);
  });
});
