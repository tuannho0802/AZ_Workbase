import { describe, expect, it } from 'vitest';
import { countsOfUser, customerRates, fmtRate, sumCustomerRows, ZERO_CUSTOMER_COUNTS } from './customerReportRates';
import type { CustomerPersonalRow } from '../types/reports.types';

const row = (userId: number, o: Partial<CustomerPersonalRow>): CustomerPersonalRow => ({
  userId, userName: `U${userId}`, ...ZERO_CUSTOMER_COUNTS, ...o,
});

describe('customerRates (cohort)', () => {
  it('chia đúng theo cohort; mẫu số 0 -> null, hiện "—"', () => {
    const r = customerRates({ ...ZERO_CUSTOMER_COUNTS, totalCustomers: 40, cohortClosedCustomers: 10, cohortJoinedCustomers: 20, cohortDepositedCustomers: 6 });
    expect(r).toEqual({ closeRate: 25, joinRate: 50, depositRate: 15 });
    expect(fmtRate(r.closeRate)).toBe('25%');
    const z = customerRates(ZERO_CUSTOMER_COUNTS);
    expect(z).toEqual({ closeRate: null, joinRate: null, depositRate: null });
    expect(fmtRate(z.depositRate)).toBe('—');
  });

  it('closedCustomers (theo ngày chốt) KHÔNG ảnh hưởng tỷ lệ - tránh > 100%', () => {
    const r = customerRates({ ...ZERO_CUSTOMER_COUNTS, totalCustomers: 5, closedCustomers: 12, cohortClosedCustomers: 1 });
    expect(r.closeRate).toBe(20);
  });
});

describe('sumCustomerRows / countsOfUser', () => {
  const rows = [row(1, { totalCustomers: 10, cohortClosedCustomers: 2 }), row(2, { totalCustomers: 5, cohortClosedCustomers: 1, closedCustomers: 3 })];
  it('cộng đủ 6 trường', () => {
    expect(sumCustomerRows(rows)).toMatchObject({ totalCustomers: 15, cohortClosedCustomers: 3, closedCustomers: 3 });
    expect(sumCustomerRows([])).toEqual(ZERO_CUSTOMER_COUNTS);
  });
  it('tìm theo user, thiếu -> 0', () => {
    expect(countsOfUser(rows, 2).totalCustomers).toBe(5);
    expect(countsOfUser(rows, 99)).toEqual(ZERO_CUSTOMER_COUNTS);
    expect(countsOfUser(undefined, 1)).toEqual(ZERO_CUSTOMER_COUNTS);
  });
});
