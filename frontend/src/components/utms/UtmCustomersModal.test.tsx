import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UtmCustomersModal } from './UtmCustomersModal';

if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const perms = new Set<string>();
vi.mock('@/lib/hooks/useMyPermissions', () => ({ useMyPermissions: () => ({ can: (k: string) => perms.has(k) }) }));
vi.mock('@/lib/hooks/useCustomerStatuses', () => ({ useCustomerStatuses: () => ({ statuses: [] }) }));
vi.mock('@/components/customers/SourceTag', () => ({ SourceTag: () => <span>src</span> }));
vi.mock('@/components/customers/StatusTag', () => ({ StatusTag: () => <span>st</span> }));

const rows = [
  { id: 1, name: 'Khách A', phone: '0901', source: 'Facebook', status: 'pending', inputDate: null, createdAt: '2026-09-01T00:00:00Z' },
  { id: 2, name: 'Khách B', phone: '0902', source: 'Facebook', status: 'pending', inputDate: null, createdAt: '2026-09-01T00:00:00Z', deletedAt: '2026-09-10T00:00:00Z' },
];
vi.mock('@/lib/hooks/useUtms', () => ({
  useUtmCustomers: () => ({ data: { data: rows, total: 2 }, isLoading: false, isFetching: false, isError: false, error: null }),
}));

const getCustomer = vi.fn();
const updateCustomer = vi.fn();
const bulkRemoveUtm = vi.fn();
vi.mock('@/lib/api/customers.api', () => ({
  customersApi: {
    getCustomer: (...a: unknown[]) => getCustomer(...a),
    updateCustomer: (...a: unknown[]) => updateCustomer(...a),
    bulkRemoveUtm: (...a: unknown[]) => bulkRemoveUtm(...a),
    restoreCustomer: vi.fn(),
    hardDeleteCustomer: vi.fn(),
  },
}));

// CustomerForm thật rất nặng (nhiều hook) -> stub, chỉ kiểm tra được mở đúng khách.
vi.mock('@/components/customers/CustomerForm', () => ({
  CustomerForm: ({ open, customer }: { open: boolean; customer?: { id: number; name: string } | null }) =>
    open ? <div data-testid="customer-form">form:{customer?.id}:{customer?.name}</div> : null,
}));

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <App>
        <UtmCustomersModal open onClose={() => {}} utmId={7} utmName="UTM X" />
      </App>
    </QueryClientProvider>,
  );
}

describe('UtmCustomersModal - sửa nhanh khách', () => {
  beforeEach(() => {
    perms.clear();
    getCustomer.mockReset();
    updateCustomer.mockReset();
    bulkRemoveUtm.mockReset();
  });

  it('có customers.edit: bấm tên khách -> tải hồ sơ đủ và mở modal sửa đúng khách', async () => {
    perms.add('customers.edit');
    getCustomer.mockResolvedValue({ id: 1, name: 'Khách A' });
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Khách A' }));
    await waitFor(() => expect(screen.getByTestId('customer-form').textContent).toBe('form:1:Khách A'));
    expect(getCustomer).toHaveBeenCalledWith(1);
  });

  it('có customers.edit: nút "Sửa nhanh" cũng mở modal sửa', async () => {
    perms.add('customers.edit');
    getCustomer.mockResolvedValue({ id: 1, name: 'Khách A' });
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Sửa nhanh/ }));
    await waitFor(() => expect(screen.getByTestId('customer-form')).toBeTruthy());
  });

  it('"Gỡ UTM" -> xác nhận -> PATCH { utmId: null } cho đúng khách', async () => {
    perms.add('customers.edit');
    updateCustomer.mockResolvedValue({});
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Gỡ UTM/ }));
    // Popconfirm mở ra -> có thêm nút xác nhận "Gỡ UTM" (nút cuối cùng trong DOM).
    const confirmBtns = await screen.findAllByRole('button', { name: /Gỡ UTM/ });
    fireEvent.click(confirmBtns[confirmBtns.length - 1]);
    await waitFor(() => expect(updateCustomer).toHaveBeenCalledWith(1, { utmId: null }));
  });

  it('KHÔNG có customers.edit: không có tên bấm được, không có Sửa nhanh/Gỡ UTM', () => {
    renderModal();
    expect(screen.queryByRole('button', { name: 'Khách A' })).toBeNull();
    expect(screen.queryByText(/Sửa nhanh/)).toBeNull();
    expect(screen.queryByText('Gỡ UTM')).toBeNull();
  });

  it('khách trong Thùng rác không có Sửa nhanh/Gỡ UTM (chỉ 1 dòng thường có)', () => {
    perms.add('customers.edit');
    renderModal();
    expect(screen.getAllByText(/Sửa nhanh/)).toHaveLength(1);
  });
});

describe('UtmCustomersModal - Gỡ UTM hàng loạt', () => {
  beforeEach(() => {
    perms.clear();
    bulkRemoveUtm.mockReset();
  });

  it('KHÔNG có customers.edit: không có checkbox chọn', () => {
    renderModal();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('khách Thùng rác bị khoá checkbox; chọn khách thường -> hiện thanh "Gỡ UTM (1)" -> gọi bulkRemoveUtm(utmId, ids)', async () => {
    perms.add('customers.edit');
    bulkRemoveUtm.mockResolvedValue({ succeeded: [1], failed: [] });
    renderModal();
    const boxes = screen.getAllByRole('checkbox'); // [chọn tất cả, Khách A, Khách B (Thùng rác)]
    expect((boxes[2] as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(boxes[1]);
    const bulkBtn = await screen.findByRole('button', { name: /Gỡ UTM \(1\)/ });
    fireEvent.click(bulkBtn);
    const confirmBtns = await screen.findAllByRole('button', { name: /Gỡ UTM/ });
    fireEvent.click(confirmBtns[confirmBtns.length - 1]);
    await waitFor(() => expect(bulkRemoveUtm).toHaveBeenCalledWith(7, [1]));
  });
});
