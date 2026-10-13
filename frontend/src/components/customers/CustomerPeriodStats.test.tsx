import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
  beforeEach(() => {
    hookSpy.mockClear();
    window.localStorage.clear();
  });

  it('mặc định kỳ Ngày + hiện đủ 3 giai đoạn Nhập/Xử lý/Nạp', () => {
    render(<CustomerPeriodStats />);
    expect(hookSpy.mock.calls[0][0]).toBe('day');
    expect(screen.getByText('Giai đoạn NHẬP')).toBeInTheDocument();
    expect(screen.getByText('Giai đoạn XỬ LÝ (chốt)')).toBeInTheDocument();
    expect(screen.getByText('Giai đoạn NẠP')).toBeInTheDocument();
    expect(within(screen.getByTestId('period-stats-detail')).getByText('$2,500.00')).toBeInTheDocument();
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

  it('Ẩn chi tiết -> chỉ còn dòng tóm tắt, Hiện chi tiết -> đầy đủ; nhớ lựa chọn', () => {
    const { unmount } = render(<CustomerPeriodStats />);
    // Mặc định mở: phần đầy đủ hiện, phần tóm tắt đang đóng (vẫn mount để trượt mượt).
    expect(screen.getByTestId('period-stats-detail')).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByTestId('period-stats-summary-wrap')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Ẩn chi tiết thống kê/ }));
    expect(screen.getByTestId('period-stats-detail')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('period-stats-summary-wrap')).toHaveAttribute('aria-hidden', 'false');
    const summary = screen.getByTestId('period-stats-summary');
    expect(summary).toHaveTextContent('Nhập mới: 12');
    expect(summary).toHaveTextContent('Đã chốt: 4');
    expect(summary).toHaveTextContent('$2,500.00');
    unmount();
    // mở lại trang: vẫn thu gọn
    render(<CustomerPeriodStats />);
    expect(screen.getByTestId('period-stats-detail')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Hiện chi tiết thống kê/ }));
    expect(screen.getByTestId('period-stats-detail')).toHaveAttribute('aria-hidden', 'false');
  });

  it('thu gọn + hideDeposit: tóm tắt không lộ tiền nạp', () => {
    window.localStorage.setItem('customers:period-stats-open', '0');
    render(<CustomerPeriodStats hideDeposit />);
    const summary = screen.getByTestId('period-stats-summary');
    expect(summary).not.toHaveTextContent('Tiền nạp');
    expect(summary).not.toHaveTextContent('$');
  });

  it('"Lọc trạng thái này" gửi status + khoảng ngày của kỳ; đang lọc -> "Bỏ lọc"', () => {
    const onFilter = vi.fn();
    const { rerender } = render(<CustomerPeriodStats onFilterStatus={onFilter} />);
    const buttons = screen.getAllByRole('button', { name: /Lọc trạng thái này/ });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);
    expect(onFilter).toHaveBeenCalledWith({
      status: 'pending',
      statusName: 'Chờ xử lý',
      dateFrom: '2026-10-13',
      dateTo: '2026-10-13',
    });
    rerender(<CustomerPeriodStats onFilterStatus={onFilter} activeStatus="pending" />);
    fireEvent.click(screen.getByRole('button', { name: /Bỏ lọc/ }));
    expect(onFilter).toHaveBeenLastCalledWith({ status: undefined, dateFrom: undefined, dateTo: undefined });
  });

  it('không truyền onFilterStatus -> không có nút lọc', () => {
    render(<CustomerPeriodStats />);
    expect(screen.queryByRole('button', { name: /Lọc trạng thái này/ })).toBeNull();
  });

  it('hiệu ứng: dùng grid-template-rows 0fr<->1fr + opacity (không unmount); giảm chuyển động -> 0ms', () => {
    render(<CustomerPeriodStats />);
    const detail = screen.getByTestId('period-stats-detail');
    expect(detail).toHaveStyle({ gridTemplateRows: '1fr', opacity: '1' });
    expect(detail.style.transition).toContain('grid-template-rows 300ms');
    fireEvent.click(screen.getByRole('button', { name: /Ẩn chi tiết thống kê/ }));
    expect(detail).toHaveStyle({ gridTemplateRows: '0fr', opacity: '0', visibility: 'hidden' });
    expect(screen.getByText('Giai đoạn NHẬP')).toBeInTheDocument(); // vẫn mount, chỉ bị thu về 0 chiều cao
  });

  it('prefers-reduced-motion: reduce -> transition 0ms nhưng vẫn đóng/mở đúng', () => {
    const orig = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: q.includes('reduce'),
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      render(<CustomerPeriodStats />);
      const detail = screen.getByTestId('period-stats-detail');
      expect(detail.style.transition).toContain('grid-template-rows 0ms');
      fireEvent.click(screen.getByRole('button', { name: /Ẩn chi tiết thống kê/ }));
      expect(detail).toHaveAttribute('aria-hidden', 'true');
    } finally {
      window.matchMedia = orig;
    }
  });
});
