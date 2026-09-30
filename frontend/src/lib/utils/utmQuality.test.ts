import { describe, expect, it } from 'vitest';
import type { UtmQualityRow } from '@/lib/types/reports.types';
import { normalizeText } from './marketingReport';
import { MIN_SAMPLE_CUSTOMERS, buildUtmInsights, filterUtmRows, rankValue, topUtms, utmHealth, utmRates } from './utmQuality';

const mk = (o: Partial<UtmQualityRow>): UtmQualityRow => ({
  utmId: 1,
  utmName: 'FB_Q4',
  color: '#1677ff',
  description: null,
  visibility: 'shared',
  isActive: true,
  lockedAt: null,
  primaryManager: null,
  secondaryManagers: [],
  customers: 0,
  newCustomers: 0,
  depositedCustomers: 0,
  closedCustomers: 0,
  newDeposited: 0,
  newClosed: 0,
  periodDepositors: 0,
  periodRevenue: 0,
  lifetimeRevenue: 0,
  newLifetimeRevenue: 0,
  depositCount: 0,
  redepositors: 0,
  avgDaysToFirstDeposit: null,
  avgDaysSamples: 0,
  byStatus: {},
  sales: { total: 0, top: [] },
  marketing: { total: 0, top: [] },
  ...o,
});

describe('utmRates', () => {
  it('tính tỷ lệ đúng và không chia cho 0', () => {
    const r = utmRates(mk({ customers: 20, depositedCustomers: 10, closedCustomers: 5, newCustomers: 8, newDeposited: 4, newClosed: 2, redepositors: 5, lifetimeRevenue: 5000, newLifetimeRevenue: 1600 }));
    expect(r).toMatchObject({ depositRate: 50, closeRate: 25, newDepositRate: 50, newCloseRate: 25, redepositRate: 50, notDeposited: 10, newNotDeposited: 4, newRevenuePerCustomer: 200 });
    expect(r.revenuePerCustomer).toBe(250);
    expect(r.revenuePerDepositor).toBe(500);
    const z = utmRates(mk({}));
    expect(z.depositRate).toBeNull();
    expect(z.revenuePerCustomer).toBeNull();
    expect(z.revenuePerDepositor).toBeNull();
    expect(z.newRevenuePerCustomer).toBeNull();
    expect(z.newNotDeposited).toBe(0);
  });
});

describe('utmHealth', () => {
  it('UTM trống / ít mẫu không bị chấm điểm', () => {
    expect(utmHealth(mk({})).key).toBe('empty');
    expect(utmHealth(mk({ customers: MIN_SAMPLE_CUSTOMERS - 1 })).key).toBe('small');
  });
  it('chấm theo ngưỡng 40% / 80%', () => {
    expect(utmHealth(mk({ customers: 10, depositedCustomers: 3 })).key).toBe('low');
    expect(utmHealth(mk({ customers: 10, depositedCustomers: 6 })).key).toBe('mid');
    expect(utmHealth(mk({ customers: 10, depositedCustomers: 9 })).key).toBe('high');
  });
});

describe('rankValue / topUtms', () => {
  it('tỷ lệ chỉ xếp UTM đủ mẫu', () => {
    expect(rankValue(mk({ customers: 2, depositedCustomers: 2 }), 'depositRate')).toBeNull();
    expect(rankValue(mk({ customers: 10, depositedCustomers: 5 }), 'depositRate')).toBe(50);
  });
  it('sắp giảm dần, bỏ giá trị 0, cắt theo limit', () => {
    const rows = [
      mk({ utmId: 1, utmName: 'A', lifetimeRevenue: 100 }),
      mk({ utmId: 2, utmName: 'B', lifetimeRevenue: 300 }),
      mk({ utmId: 3, utmName: 'C', lifetimeRevenue: 0 }),
      mk({ utmId: 4, utmName: 'D', lifetimeRevenue: 200 }),
    ];
    expect(topUtms(rows, 'lifetimeRevenue', 2).map((x) => x.name)).toEqual(['B', 'D']);
    expect(topUtms(rows, 'lifetimeRevenue', 10).map((x) => x.name)).toEqual(['B', 'D', 'A']);
  });
});

describe('buildUtmInsights', () => {
  it('phân loại cần xử lý / làm tốt / trống / không ai nạp', () => {
    const rows = [
      mk({ utmId: 1, utmName: 'Low', customers: 20, depositedCustomers: 4 }),
      mk({ utmId: 2, utmName: 'High', customers: 10, depositedCustomers: 9, lifetimeRevenue: 900 }),
      mk({ utmId: 3, utmName: 'Empty', customers: 0 }),
      mk({ utmId: 4, utmName: 'Zero', customers: 8, depositedCustomers: 0 }),
      mk({ utmId: 5, utmName: 'Tiny', customers: 2, depositedCustomers: 0 }),
    ];
    const i = buildUtmInsights(rows);
    expect(i.needsAttention.map((r) => r.utmName)).toEqual(['Low', 'Zero']);
    expect(i.bestPractice.map((r) => r.utmName)).toEqual(['High']);
    expect(i.emptyUtms.map((r) => r.utmName)).toEqual(['Empty']);
    expect(i.zeroDeposit.map((r) => r.utmName)).toEqual(['Zero']);
  });
});

describe('filterUtmRows', () => {
  const rows = [
    mk({ utmId: 1, utmName: 'Facebook Đợt 1', customers: 3 }),
    mk({ utmId: 2, utmName: 'TikTok', customers: 0, primaryManager: { id: 9, name: 'Nguyễn Văn An', role: null, departmentName: null, departmentColor: null, positionName: null, positionColor: null } }),
  ];
  it('tìm không dấu theo tên UTM hoặc quản lý', () => {
    expect(filterUtmRows(rows, { search: 'dot 1' }, normalizeText).map((r) => r.utmId)).toEqual([1]);
    expect(filterUtmRows(rows, { search: 'van an' }, normalizeText).map((r) => r.utmId)).toEqual([2]);
  });
  it('ẩn UTM trống', () => {
    expect(filterUtmRows(rows, { hideEmpty: true }, normalizeText).map((r) => r.utmId)).toEqual([1]);
  });
});
