import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CustomerPeriodStats as PeriodStatsData, CustomerPeriodWindowStats } from '@/lib/types/customer.types';

const win = (o: Partial<CustomerPeriodWindowStats> = {}): CustomerPeriodWindowStats => ({
  input: { entered: 12, enteredDeposited: 5, depositAmount: 3400, depositCount: 7 },
  handled: { closed: 4, closedDeposited: 3, depositAmount: 1800, depositCount: 4 },
  cash: {
    amount: 2500,
    depositCount: 6,
    depositorCount: 4,
    ftdCount: 2,
    ftdAmount: 1000,
    redepositCount: 4,
    redepositAmount: 1500,
    averagePerDepositor: 625,
  },
  ...o,
});

const fixture: PeriodStatsData = {
  period: { type: 'day', from: '2026-10-13', to: '2026-10-13', previousFrom: '2026-10-12', previousTo: '2026-10-12' },
  granularity: 'day',
  current: win(),
  previous: win({ input: { entered: 6, enteredDeposited: 0, depositAmount: 0, depositCount: 0 } }),
  byStatus: [
    { code: 'pending', name: 'Chờ xử lý', color: 'gold', count: 8 },
    { code: 'closed', name: 'Đã chốt', color: 'green', count: 4 },
  ],
  trend: [{ bucket: '2026-10-13', entered: 12, closed: 4, depositAmount: 2500 }],
};

const hookSpy = vi.fn();
vi.mock('@/lib/hooks/useCustomerStats', () => ({
  useCustomerPeriodStats: (...args: unknown[]) => {
    hookSpy(...args);
    return { data: fixture, isLoading: false, isFetching: false };
  },
}));
// recharts không cần cho test này - chặn để không kéo cả thư viện vẽ vào jsdom.
vi.mock('next/dynamic', () => ({ default: () => () => <div data-testid="chart" /> }));

import { CustomerPeriodStats } from './CustomerPeriodStats';

describe('CustomerPeriodStats', () => {
  beforeEach(() => hookSpy.mockClear());

  it('mặc định kỳ Ngày + hiện đủ 3 giai đoạn Nhập/Xử lý/Nạp', () => {
    render(<CustomerPeriodStats />);
    expect(hookSpy.mock.calls[0][0]).toBe('day');
    expect(screen.getByText('Giai đoạn NHẬP')).toBeInTheDocument();
    expect(screen.getByText('Giai đoạn XỬ LÝ (chốt)')).toBeInTheDocument();
    expect(screen.getByText('Giai đoạn NẠP')).toBeInTheDocument();
    expect(screen.getByText('$2,500.00')).toBeInTheDocument();
    // Nhập 12 vs kỳ trước 6 => +100%
    expect(screen.getByText(/100% so kỳ trước/)).toBeInTheDocument();
  });

  it('đổi sang Tuần -> gọi hook với period=week và hiện biểu đồ xu hướng', () => {
    render(<CustomerPeriodStats />);
    expect(screen.queryByTestId('chart')).toBeNull(); // kỳ Ngày chỉ 1 điểm -> không vẽ biểu đồ
    fireEvent.click(screen.getByText('Tuần'));
    expect(hookSpy.mock.calls.at(-1)?.[0]).toBe('week');
    expect(screen.getAllByTestId('chart').length).toBeGreaterThan(0);
  });

  it('hideDeposit: ẩn toàn bộ số tiền nạp + giai đoạn Nạp, vẫn giữ số lượng khách', () => {
    render(<CustomerPeriodStats hideDeposit />);
    expect(screen.queryByText('Giai đoạn NẠP')).toBeNull();
    expect(screen.queryByText('$2,500.00')).toBeNull();
    expect(screen.queryByText('Tổng nạp của nhóm này')).toBeNull();
    expect(screen.getByText('Khách nhập mới')).toBeInTheDocument();
  });
});
