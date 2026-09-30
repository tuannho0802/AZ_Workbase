import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UtmCustomerRow, UtmStatsUtmBrief } from '@/lib/api/utms.api';
import { UtmStatsCustomersDrawer } from './UtmStatsCustomersDrawer';

if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

let rows: UtmCustomerRow[] = [];
let lastParams: Record<string, unknown> = {};
vi.mock('@/lib/hooks/useUtms', () => ({
  useUtmStatsCustomers: (params: Record<string, unknown>) => {
    lastParams = params;
    return { data: { data: rows, total: rows.length }, isLoading: false, isFetching: false, isError: false, error: null };
  },
}));

let perms: string[] = [];
vi.mock('@/lib/hooks/useMyPermissions', () => ({ useMyPermissions: () => ({ can: (k: string) => perms.includes(k) }) }));
vi.mock('@/components/customers/StatusTag', () => ({ StatusTag: ({ code }: { code?: string }) => <span>{code}</span> }));
vi.mock('@/components/customers/SourceTag', () => ({ SourceTag: ({ source }: { source?: string }) => <span>{source}</span> }));
vi.mock('@/components/customers/CustomerForm', () => ({ CustomerForm: () => null }));

const bulkRemoveUtm = vi.fn();
const updateCustomer = vi.fn();
vi.mock('@/lib/api/customers.api', () => ({
  customersApi: {
    bulkRemoveUtm: (...a: unknown[]) => bulkRemoveUtm(...a),
    updateCustomer: (...a: unknown[]) => updateCustomer(...a),
    getCustomer: vi.fn(),
  },
}));

const utms: UtmStatsUtmBrief[] = [
  { id: 1, name: 'FB_Q4', color: '#1677ff', isActive: true, primaryManager: { id: 10, name: 'Chính A' }, secondaryManagers: [] },
  { id: 2, name: 'TT_Q4', color: '#722ed1', isActive: false, primaryManager: { id: 11, name: 'Chính C' }, secondaryManagers: [{ id: 20, name: 'Phụ B' }] },
];
const statuses = [{ code: 'pending', name: 'Chờ xử lý', color: '#faad14' }, { code: 'closed', name: 'Đã chốt', color: '#52c41a' }];
const drill = { title: 'Khách ngày 28/09/2026 — Chờ xử lý', from: '2026-09-28', to: '2026-09-28', status: 'pending' };

const row = (over: Partial<UtmCustomerRow>): UtmCustomerRow => ({
  id: 1, name: 'Nguyễn An', phone: '0901', source: 'Facebook', status: 'pending', inputDate: '2026-09-28', createdAt: '2026-09-28T01:00:00Z',
  utmId: 1, utm: { id: 1, name: 'FB_Q4', color: '#1677ff', isActive: true }, ...over,
});

const renderDrawer = (initialFilters = { activeUtmIds: [] as number[], lockedUtmIds: [] as number[] }) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App>
        <UtmStatsCustomersDrawer drill={drill} onClose={() => {}} utms={utms} statuses={statuses} initialFilters={initialFilters} />
      </App>
    </QueryClientProvider>,
  );

describe('UtmStatsCustomersDrawer (Mini Table)', () => {
  beforeEach(() => {
    rows = [row({ id: 1 }), row({ id: 2, name: 'Trần Bình', utmId: 2, utm: { id: 2, name: 'TT_Q4', color: '#722ed1', isActive: false } })];
    perms = ['customers.edit'];
    lastParams = {};
    bulkRemoveUtm.mockReset();
    updateCustomer.mockReset();
  });

  it('gọi API với khoảng ngày + trạng thái của cột vừa bấm, phân trang 10', () => {
    renderDrawer();
    expect(lastParams).toMatchObject({ from: '2026-09-28', to: '2026-09-28', status: 'pending', page: 1, limit: 10 });
  });

  it('bộ lọc nhanh từ tab Thống kê được dùng làm giá trị khởi tạo', () => {
    renderDrawer({ primaryManagerId: 10, activeUtmIds: [1], lockedUtmIds: [] } as never);
    expect(lastParams).toMatchObject({ primaryManagerId: 10, utmIds: [1] });
  });

  it('ID UTM không còn trong danh sách bị bỏ khỏi bộ lọc khởi tạo', () => {
    renderDrawer({ activeUtmIds: [1, 999], lockedUtmIds: [] });
    expect(lastParams.utmIds).toEqual([1]);
  });

  it('hiện 4 quick filter giống tab Thống kê + tag UTM của từng khách', () => {
    renderDrawer();
    expect(screen.getByRole('combobox', { name: 'Lọc theo Quản lý chính' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Lọc theo Quản lý phụ' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Lọc theo UTM hoạt động' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Lọc theo UTM đã khoá' })).toBeTruthy();
    expect(screen.getByText('Nguyễn An')).toBeTruthy();
    expect(screen.getByText('FB_Q4')).toBeTruthy();
    expect(screen.getByText('TT_Q4')).toBeTruthy();
  });

  it('không có customers.edit -> KHÔNG có nút thao tác nhanh / chọn nhiều', () => {
    perms = [];
    renderDrawer();
    expect(screen.queryByText('Sửa nhanh')).toBeNull();
    expect(screen.queryByText('Gỡ UTM')).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('có customers.edit -> có Sửa nhanh + Gỡ UTM từng dòng', () => {
    renderDrawer();
    expect(screen.getAllByText('Sửa nhanh')).toHaveLength(2);
    expect(screen.getAllByText('Gỡ UTM')).toHaveLength(2);
  });

  it('gỡ UTM hàng loạt: gom khách theo UTM, mỗi UTM 1 request', async () => {
    bulkRemoveUtm.mockImplementation(async (_utmId: number, ids: number[]) => ({ succeeded: ids, failed: [] }));
    renderDrawer();
    const boxes = screen.getAllByRole('checkbox'); // [chọn tất cả, khách 1 (UTM 1), khách 2 (UTM 2)]
    fireEvent.click(boxes[1]);
    fireEvent.click(boxes[2]);
    fireEvent.click(await screen.findByRole('button', { name: /Gỡ UTM \(2\)/ }));
    const confirmBtns = await screen.findAllByRole('button', { name: /Gỡ UTM/ });
    fireEvent.click(confirmBtns[confirmBtns.length - 1]);
    await waitFor(() => expect(bulkRemoveUtm).toHaveBeenCalledTimes(2));
    expect(bulkRemoveUtm).toHaveBeenCalledWith(1, [1]);
    expect(bulkRemoveUtm).toHaveBeenCalledWith(2, [2]);
  }, 30000);
});
