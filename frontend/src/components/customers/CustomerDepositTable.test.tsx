import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';

const getDepositsSpy = vi.fn();
const updateNoteSpy = vi.fn();
vi.mock('@/lib/api/customers.api', () => ({
  customersApi: {
    getCustomerDeposits: (...a: unknown[]) => getDepositsSpy(...a),
    updateDepositNote: (...a: unknown[]) => updateNoteSpy(...a),
    deleteDeposit: vi.fn(),
  },
}));

let granted: string[] = [];
vi.mock('@/lib/hooks/useMyPermissions', () => ({
  useMyPermissions: () => ({ can: (k: string) => granted.includes(k) }),
}));

import { CustomerDepositTable } from './CustomerDepositTable';

const deposit = {
  id: 11, customerId: 3, amount: 1500, depositDate: '2026-09-20', broker: 'XM',
  note: 'ghi chú cũ', createdAt: '2026-09-20T03:00:00.000Z', createdBy: { id: 1, name: 'Admin' },
};

const renderTable = () =>
  render(
    <App>
      <CustomerDepositTable customerId={3} />
    </App>,
  );

describe('CustomerDepositTable - sửa ghi chú nạp', () => {
  beforeEach(() => {
    getDepositsSpy.mockReset().mockResolvedValue([deposit]);
    updateNoteSpy.mockReset();
    granted = [];
  });

  it('có customers.edit: sửa note -> gọi API với note đã trim, UI cập nhật ngay; KHÔNG có ô sửa số tiền', async () => {
    granted = ['customers.edit'];
    updateNoteSpy.mockResolvedValue({ ...deposit, note: 'ghi chú mới' });
    renderTable();

    fireEvent.click(await screen.findByTitle('Sửa ghi chú'));
    // Chỉ có DUY NHẤT 1 ô nhập (ghi chú) - số tiền không thể sửa
    expect(screen.getAllByRole('textbox')).toHaveLength(1);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  ghi chú mới  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));

    await waitFor(() => expect(updateNoteSpy).toHaveBeenCalledWith(11, 'ghi chú mới'));
    expect(await screen.findByText(/ghi chú mới/)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    // Số tiền giữ nguyên
    expect(screen.getByText(/1,500\.00/)).toBeTruthy();
  });

  it('bấm Hủy -> không gọi API, giữ note cũ', async () => {
    granted = ['customers.edit'];
    renderTable();

    fireEvent.click(await screen.findByTitle('Sửa ghi chú'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'đổi ý' } });
    fireEvent.click(screen.getByRole('button', { name: /Hủy/ }));

    expect(updateNoteSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/ghi chú cũ/)).toBeTruthy();
  });

  it('KHÔNG có customers.edit: ẩn nút sửa/thêm ghi chú (FE tự ẩn, không để 403)', async () => {
    granted = [];
    renderTable();

    await screen.findByText(/ghi chú cũ/);
    expect(screen.queryByTitle('Sửa ghi chú')).toBeNull();
    expect(screen.queryByTitle('Thêm ghi chú')).toBeNull();
  });

  it('phiếu chưa có note + có quyền: hiện nút "Ghi chú" để thêm', async () => {
    granted = ['customers.edit'];
    getDepositsSpy.mockResolvedValue([{ ...deposit, note: undefined }]);
    renderTable();

    expect(await screen.findByTitle('Thêm ghi chú')).toBeTruthy();
  });
});
