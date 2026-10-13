import {
  buildBuckets,
  granularityOf,
  resolveCustomerStatsWindow,
  resolvePreviousCustomerStatsWindow,
} from './customers-period-stats.service';

describe('customers-period-stats - khoảng ngày', () => {
  it('day = đúng 1 ngày, kỳ trước = hôm trước', () => {
    expect(resolveCustomerStatsWindow('day', '2026-03-01')).toEqual({ from: '2026-03-01', to: '2026-03-01' });
    expect(resolvePreviousCustomerStatsWindow('day', '2026-03-01')).toEqual({ from: '2026-02-28', to: '2026-02-28' });
  });

  it('week = Thứ Hai -> Chủ Nhật trọn vẹn (2026-10-13 là Thứ Ba)', () => {
    expect(resolveCustomerStatsWindow('week', '2026-10-13')).toEqual({ from: '2026-10-12', to: '2026-10-18' });
    expect(resolvePreviousCustomerStatsWindow('week', '2026-10-13')).toEqual({ from: '2026-10-05', to: '2026-10-11' });
  });

  it('month / year trọn vẹn theo lịch', () => {
    expect(resolveCustomerStatsWindow('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(resolveCustomerStatsWindow('year', '2026-06-01')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(resolvePreviousCustomerStatsWindow('year', '2026-06-01')).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });
});

describe('customers-period-stats - bucket', () => {
  it('granularity: năm theo tháng, còn lại theo ngày', () => {
    expect(granularityOf('year')).toBe('month');
    expect(granularityOf('day')).toBe('day');
    expect(granularityOf('week')).toBe('day');
    expect(granularityOf('month')).toBe('day');
  });

  it('sinh đủ bucket ngày liên tục (tuần = 7)', () => {
    const b = buildBuckets({ from: '2026-10-12', to: '2026-10-18' }, 'day');
    expect(b).toHaveLength(7);
    expect(b[0]).toBe('2026-10-12');
    expect(b[6]).toBe('2026-10-18');
  });

  it('sinh đủ 12 bucket tháng cho năm', () => {
    const b = buildBuckets({ from: '2026-01-01', to: '2026-12-31' }, 'month');
    expect(b).toHaveLength(12);
    expect(b[0]).toBe('2026-01');
    expect(b[11]).toBe('2026-12');
  });
});
