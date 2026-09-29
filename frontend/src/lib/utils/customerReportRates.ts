import { pct } from './marketingReport';
import type { CustomerBreakdownCounts, CustomerPersonalRow } from '../types/reports.types';

export const ZERO_CUSTOMER_COUNTS: CustomerBreakdownCounts = {
  totalCustomers: 0,
  closedCustomers: 0,
  joinedGroupCustomers: 0,
  cohortClosedCustomers: 0,
  cohortJoinedCustomers: 0,
  cohortDepositedCustomers: 0,
};

/** Cộng các dòng cá nhân thành 1 tổng (dùng khi BE không trả `total`: role không phải scope=all). */
export function sumCustomerRows(rows: CustomerBreakdownCounts[]): CustomerBreakdownCounts {
  return rows.reduce(
    (a, r) => ({
      totalCustomers: a.totalCustomers + r.totalCustomers,
      closedCustomers: a.closedCustomers + r.closedCustomers,
      joinedGroupCustomers: a.joinedGroupCustomers + r.joinedGroupCustomers,
      cohortClosedCustomers: a.cohortClosedCustomers + r.cohortClosedCustomers,
      cohortJoinedCustomers: a.cohortJoinedCustomers + r.cohortJoinedCustomers,
      cohortDepositedCustomers: a.cohortDepositedCustomers + r.cohortDepositedCustomers,
    }),
    { ...ZERO_CUSTOMER_COUNTS },
  );
}

export interface CustomerRates {
  /** % data MỚI của kỳ hiện đã chốt. */
  closeRate: number | null;
  /** % data MỚI của kỳ đã join >= 1 nhóm. */
  joinRate: number | null;
  /** % data MỚI của kỳ đã từng nạp. */
  depositRate: number | null;
}

/**
 * Tỷ lệ theo COHORT: tử số và mẫu số cùng là tập "data mới đổ về trong kỳ" nên luôn <= 100%.
 * KHÔNG chia `closedCustomers`/`joinedGroupCustomers` (lọc theo ngày chốt/ngày join) cho `totalCustomers` -
 * khác cột ngày nên có thể ra > 100%. Mẫu số = 0 -> null (FE hiện "—").
 */
export function customerRates(c: CustomerBreakdownCounts): CustomerRates {
  return {
    closeRate: pct(c.cohortClosedCustomers, c.totalCustomers),
    joinRate: pct(c.cohortJoinedCustomers, c.totalCustomers),
    depositRate: pct(c.cohortDepositedCustomers, c.totalCustomers),
  };
}

export const fmtRate = (v: number | null): string => (v == null ? '—' : `${v}%`);

/** Tìm dòng của 1 nhân viên (Sales chính) trong báo cáo khách, thiếu -> tổng 0. */
export function countsOfUser(rows: CustomerPersonalRow[] | undefined, userId: number): CustomerBreakdownCounts {
  const r = rows?.find((x) => x.userId === userId);
  return r ?? { ...ZERO_CUSTOMER_COUNTS };
}
