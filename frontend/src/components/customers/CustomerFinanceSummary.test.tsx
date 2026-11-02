import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const summarySpy = vi.fn();
vi.mock('@/lib/api/customers.api', () => ({
  customersApi: { getCustomerFinanceSummary: (...a: unknown[]) => summarySpy(...a) },
}));

import { CustomerFinanceSummary } from './CustomerFinanceSummary';

describe('CustomerFinanceSummary', () => {
  beforeEach(() => {
    summarySpy.mockReset();
  });

  it('hiện Tổng nạp / Đã rút / Nạp thực từ finance-summary (toàn thời gian)', async () => {
    summarySpy.mockResolvedValue({ totalDeposit: 5000, totalWithdrawal: 1200.5, netDeposit: 3799.5, depositCount: 7, withdrawalCount: 2 });
    render(<CustomerFinanceSummary customerId={3} />);
    await waitFor(() => expect(screen.getByText('$5,000.00')).toBeTruthy());
    expect(screen.getByText('$1,200.50')).toBeTruthy();
    expect(screen.getByText('$3,799.50')).toBeTruthy();
    expect(screen.getByText('Tổng nạp (7 phiếu)')).toBeTruthy();
    expect(summarySpy).toHaveBeenCalledWith(3);
  });

  it('Nạp thực âm hiện số âm', async () => {
    summarySpy.mockResolvedValue({ totalDeposit: 100, totalWithdrawal: 300, netDeposit: -200, depositCount: 1, withdrawalCount: 1 });
    render(<CustomerFinanceSummary customerId={3} />);
    await waitFor(() => expect(screen.getByText('-$200.00')).toBeTruthy());
  });

  it('API lỗi -> ẩn khối, không crash', async () => {
    summarySpy.mockRejectedValue(new Error('x'));
    const { container } = render(<CustomerFinanceSummary customerId={3} />);
    await waitFor(() => expect(container.querySelector('[data-testid="finance-summary"]')).toBeNull());
  });
});
