import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';

const getSpy = vi.fn();
const updateNoteSpy = vi.fn();
const deleteSpy = vi.fn();
vi.mock('@/lib/api/customers.api', () => ({
  customersApi: {
    getCustomerWithdrawals: (...a: unknown[]) => getSpy(...a),
    updateWithdrawalNote: (...a: unknown[]) => updateNoteSpy(...a),
    deleteWithdrawal: (...a: unknown[]) => deleteSpy(...a),
  },
}));

let granted: string[] = [];
vi.mock('@/lib/hooks/useMyPermissions', () => ({
  useMyPermissions: () => ({ can: (k: string) => granted.includes(k) }),
}));

import { CustomerWithdrawalTable } from './CustomerWithdrawalTable';

const withdrawal = {
  id: 21, customerId: 3, amount: 800, withdrawalDate: '2026-10-20', broker: 'XM',
  note: 'ghi chú cũ', createdAt: '2026-10-20T03:00:00.000Z', createdBy: { id: 1, name: 'Admin' },
};

const renderTable = (onChanged?: () => void) =>
  render(
    <App>
      <CustomerWithdrawalTable customerId={3} onChanged={onChanged} />
    </App>,
  );

describe('CustomerWithdrawalTable', () => {
  beforeEach(() => {
    getSpy.mockReset().mockResolvedValue([withdrawal]);
    updateNoteSpy.mockReset();
    deleteSpy.mockReset();
    granted = [];
  });

  it('hiện phiếu rút với dấu trừ; KHÔNG có nút sửa/xoá khi thiếu quyền', async () => {
    renderTable();
    expect(await screen.findByText(/-\$800\.00/)).toBeTruthy();
    expect(screen.queryByTitle('Sửa ghi chú')).toBeNull();
    expect(screen.queryByTitle('Xóa phiếu rút')).toBeNull();
  });

  it('có customers.edit: sửa ghi chú -> gọi API với note đã trim; chỉ 1 ô nhập (không sửa số tiền)', async () => {
    granted = ['customers.edit'];
    updateNoteSpy.mockResolvedValue({ ...withdrawal, note: 'mới' });
    renderTable();
    fireEvent.click(await screen.findByTitle('Sửa ghi chú'));
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  mới  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));
    await waitFor(() => expect(updateNoteSpy).toHaveBeenCalledWith(21, 'mới'));
  });

  it('có customers.delete: xoá -> gọi API và onChanged để cập nhật chỉ số', async () => {
    granted = ['customers.delete'];
    deleteSpy.mockResolvedValue({});
    const onChanged = vi.fn();
    renderTable(onChanged);
    fireEvent.click(await screen.findByTitle('Xóa phiếu rút'));
    fireEvent.click(await screen.findByRole('button', { name: /^Xóa$/ }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(21));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
