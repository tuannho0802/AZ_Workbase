import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';

const createDepositSpy = vi.fn();
vi.mock('@/lib/api/customers.api', () => ({
  customersApi: { createDeposit: (...args: unknown[]) => createDepositSpy(...args) },
}));

import { DepositForm } from './DepositForm';

const renderForm = (onSuccess = vi.fn()) => {
  render(
    <App>
      <DepositForm customerId={7} onSuccess={onSuccess} />
    </App>,
  );
  return onSuccess;
};

const fill = (note?: string) => {
  fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } });
  if (note !== undefined) {
    fireEvent.change(screen.getByPlaceholderText(/Nội dung giao dịch/), { target: { value: note } });
  }
  fireEvent.click(screen.getByRole('button', { name: /Xác nhận nạp tiền/ }));
};

describe('DepositForm - ghi chú nạp', () => {
  beforeEach(() => {
    createDepositSpy.mockReset();
    createDepositSpy.mockResolvedValue({ id: 1 });
  });

  it('gửi note đã trim lên API và gọi onSuccess', async () => {
    const onSuccess = renderForm();
    fill('  Nạp lần 2 - mã GD 123  ');
    await waitFor(() => expect(createDepositSpy).toHaveBeenCalledTimes(1));
    const [customerId, payload] = createDepositSpy.mock.calls[0];
    expect(customerId).toBe(7);
    expect(payload.note).toBe('Nạp lần 2 - mã GD 123');
    expect(payload.amount).toBe(100);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('note rỗng/toàn khoảng trắng -> KHÔNG gửi (undefined), tránh lưu chuỗi rỗng', async () => {
    renderForm();
    fill('   ');
    await waitFor(() => expect(createDepositSpy).toHaveBeenCalledTimes(1));
    expect(createDepositSpy.mock.calls[0][1].note).toBeUndefined();
  });
});
