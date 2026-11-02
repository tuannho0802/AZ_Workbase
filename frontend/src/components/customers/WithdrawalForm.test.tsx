import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';

const createWithdrawalSpy = vi.fn();
vi.mock('@/lib/api/customers.api', () => ({
  customersApi: { createWithdrawal: (...args: unknown[]) => createWithdrawalSpy(...args) },
}));

import { WithdrawalForm } from './WithdrawalForm';

const renderForm = (onSuccess = vi.fn()) => {
  render(
    <App>
      <WithdrawalForm customerId={7} onSuccess={onSuccess} />
    </App>,
  );
  return onSuccess;
};

const fill = (amount: string, note?: string) => {
  fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: amount } });
  if (note !== undefined) {
    fireEvent.change(screen.getByPlaceholderText(/Nội dung giao dịch/), { target: { value: note } });
  }
  fireEvent.click(screen.getByRole('button', { name: /Xác nhận rút tiền/ }));
};

describe('WithdrawalForm', () => {
  beforeEach(() => {
    createWithdrawalSpy.mockReset();
    createWithdrawalSpy.mockResolvedValue({ id: 1 });
  });

  it('gửi amount (number) + note đã trim + ngày YYYY-MM-DD lên API rút tiền rồi gọi onSuccess', async () => {
    const onSuccess = renderForm();
    fill('250.5', '  Rút lần 1  ');
    await waitFor(() => expect(createWithdrawalSpy).toHaveBeenCalledTimes(1));
    const [customerId, payload] = createWithdrawalSpy.mock.calls[0];
    expect(customerId).toBe(7);
    expect(payload.amount).toBe(250.5);
    expect(payload.note).toBe('Rút lần 1');
    expect(payload.withdrawalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('note rỗng/toàn khoảng trắng -> KHÔNG gửi (undefined)', async () => {
    renderForm();
    fill('10', '   ');
    await waitFor(() => expect(createWithdrawalSpy).toHaveBeenCalledTimes(1));
    expect(createWithdrawalSpy.mock.calls[0][1].note).toBeUndefined();
  });

  it('API lỗi -> KHÔNG gọi onSuccess', async () => {
    createWithdrawalSpy.mockRejectedValue(new Error('boom'));
    const onSuccess = renderForm();
    fill('10');
    await waitFor(() => expect(createWithdrawalSpy).toHaveBeenCalledTimes(1));
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
