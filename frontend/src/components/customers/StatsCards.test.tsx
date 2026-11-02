import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatsCards } from './StatsCards';
import type { CustomerStats } from '@/lib/types/customer.types';

const stats = (o: Partial<CustomerStats> = {}): CustomerStats => ({
  totalCustomers: 10, newToday: 1, closedTotal: 2, pendingTotal: 3, potentialTotal: 4,
  totalDepositAmount: 1000, totalWithdrawalAmount: 400, netDepositAmount: 600, ...o,
});

describe('StatsCards - Đã rút / Nạp thực', () => {
  it('hiện đủ 3 chỉ số tiền', () => {
    render(<StatsCards stats={stats()} loading={false} />);
    expect(screen.getByText('$1,000.00')).toBeTruthy();
    expect(screen.getByTestId('stat-withdrawal').textContent).toContain('$400.00');
    expect(screen.getByTestId('stat-net-deposit').textContent).toContain('$600.00');
  });

  it('Nạp thực ÂM hiển thị số âm', () => {
    render(<StatsCards stats={stats({ netDepositAmount: -250.5 })} loading={false} />);
    expect(screen.getByTestId('stat-net-deposit').textContent).toContain('-$250.50');
  });

  it('BE cũ chưa trả 2 field -> 0, không vỡ', () => {
    render(
      <StatsCards
        stats={stats({ totalWithdrawalAmount: undefined, netDepositAmount: undefined })}
        loading={false}
      />,
    );
    expect(screen.getByTestId('stat-withdrawal').textContent).toContain('$0.00');
  });

  it('hideFinance (tab:withdrawals bị ẩn) -> ẩn 2 thẻ mới nhưng giữ Tổng nạp', () => {
    render(<StatsCards stats={stats()} loading={false} hideFinance />);
    expect(screen.queryByTestId('stat-withdrawal')).toBeNull();
    expect(screen.queryByTestId('stat-net-deposit')).toBeNull();
    expect(screen.getByText('$1,000.00')).toBeTruthy();
  });

  it('hideDeposit (tab:deposits bị ẩn) -> ẩn cả 2 thẻ mới, không lộ số tiền', () => {
    render(<StatsCards stats={stats()} loading={false} hideDeposit />);
    expect(screen.queryByTestId('stat-withdrawal')).toBeNull();
    expect(screen.queryByTestId('stat-net-deposit')).toBeNull();
  });

  it('nhãn đổi theo khung ngày lọc', () => {
    render(<StatsCards stats={stats()} loading={false} depositLabel="Tổng nạp (theo ngày lọc, USD)" />);
    expect(screen.getByText('Đã rút (theo ngày lọc, USD)')).toBeTruthy();
    expect(screen.getByText('Nạp thực (theo ngày lọc, USD)')).toBeTruthy();
  });
});
