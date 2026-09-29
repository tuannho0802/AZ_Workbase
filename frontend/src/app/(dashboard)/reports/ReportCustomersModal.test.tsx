import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

let listResult: Record<string, unknown> = {};
const listSpy = vi.fn();
const detailSpy = vi.fn();
vi.mock('@/lib/hooks/useReports', () => ({
  useReportCustomerDetail: (id: number | null, ctx: string) => {
    detailSpy(id, ctx);
    return { data: undefined, isLoading: id != null, isError: false };
  },
  useReportCustomerList: (q: unknown, enabled: boolean) => {
    listSpy(q, enabled);
    return listResult;
  },
}));
vi.mock('@/lib/hooks/useCustomerStatuses', () => ({ useCustomerStatuses: () => ({ statuses: [{ code: 'pending', name: 'Chờ xử lý', color: '#faad14' }] }) }));
vi.mock('@/lib/hooks/useMediaSources', () => ({ useMediaSources: () => ({ sources: [{ id: 1, name: 'Facebook' }] }) }));
vi.mock('@/components/customers/SourceTag', () => ({ SourceTag: ({ source }: { source?: string }) => <span>{source}</span> }));
vi.mock('@/components/customers/StatusTag', () => ({ StatusTag: ({ code }: { code?: string }) => <span>{code}</span> }));

import ReportCustomersModal, { getQuickOptions } from './ReportCustomersModal';

const query = { period: 'week' as const, anchor: '2026-09-27' };
const row = {
  id: 1, name: 'Nguyễn Văn A', phone: null, email: null, source: 'Facebook', status: 'pending',
  inputDate: '2026-09-25', createdAt: '2026-09-25T03:00:00.000Z', closedDate: null,
  salesUser: { id: 5, name: 'Sales One', departmentName: 'Phòng Kinh doanh', departmentColor: '#1677ff' },
  marketingUser: null, createdBy: { id: 3, name: 'Lê Tuấn', departmentName: 'Phòng Marketing', departmentColor: '#eb2f96' },
};

describe('ReportCustomersModal', () => {
  it('ít data: 0 khách -> hiện trạng thái rỗng, không crash', () => {
    listResult = { data: { data: [], total: 0, page: 1, limit: 10, totalPages: 1, period: { type: 'week', from: '2026-09-21 00:00:00', to: '2026-09-27 23:59:59' } }, isLoading: false, isFetching: false, isError: false };
    render(<ReportCustomersModal drill={{ metric: 'total' }} onClose={vi.fn()} query={query} context="customers" />);
    expect(screen.getByText('Không có khách hàng phù hợp')).toBeTruthy();
  });

  it('1 khách (chưa có SĐT, chưa gán Marketing) -> hiện đủ, kèm Tag phòng ban ở ngữ cảnh marketing', () => {
    listResult = { data: { data: [row], total: 1, page: 1, limit: 10, totalPages: 1 }, isLoading: false, isFetching: false, isError: false };
    render(<ReportCustomersModal drill={{ metric: 'unassigned_marketing', label: 'X' }} onClose={vi.fn()} query={query} context="marketing" />);
    expect(screen.getByText('Data mới chưa gán Marketing — X')).toBeTruthy();
    expect(screen.getByText('Nguyễn Văn A')).toBeTruthy();
    // 1 ở ô lọc nhanh + 1 ở ô SĐT của dòng.
    expect(screen.getAllByText('Chưa có SĐT')).toHaveLength(2);
    expect(screen.getByText('Chưa gán')).toBeTruthy();
    expect(screen.getByText('Phòng Marketing')).toBeTruthy();
    // Chỉ số 'chưa gán Marketing' bỏ lọc nhanh "Chưa có Marketing" (thừa).
    expect(screen.queryByText('Chưa có Marketing')).toBeNull();
  });

  it('gửi đúng metric/context/preset/status khởi tạo lên API', () => {
    listResult = { data: undefined, isLoading: true, isFetching: true, isError: false };
    render(
      <ReportCustomersModal drill={{ metric: 'total', preset: { salesUserId: 5 }, initialStatus: 'pending' }} onClose={vi.fn()} query={query} context="customers" />,
    );
    const q = listSpy.mock.calls.at(-1)![0];
    expect(q).toMatchObject({ metric: 'total', context: 'customers', salesUserId: 5, limit: 10, period: 'week' });
  });

  const withRow = () => {
    listResult = { data: { data: [row], total: 1, page: 1, limit: 10, totalPages: 1 }, isLoading: false, isFetching: false, isError: false };
  };
  const headers = () => Array.from(document.querySelectorAll('th')).map((th) => th.textContent?.trim());

  it('lọc nhanh "Chưa có Sales" -> bỏ cột Sales chính, thêm cột Marketing phụ trách', () => {
    withRow();
    render(<ReportCustomersModal drill={{ metric: 'total' }} onClose={vi.fn()} query={query} context="customers" />);
    expect(headers()).toContain('Sales chính');
    expect(headers()).not.toContain('Marketing phụ trách');
    fireEvent.click(screen.getByText('Chưa có Sales'));
    expect(headers()).not.toContain('Sales chính');
    expect(headers()).toContain('Marketing phụ trách');
    expect(listSpy.mock.calls.at(-1)![0]).toMatchObject({ quick: 'no_sales' });
  });

  it('lọc nhanh "Chưa có SĐT" -> bỏ cột SĐT, thay bằng cột Email', () => {
    withRow();
    render(<ReportCustomersModal drill={{ metric: 'total' }} onClose={vi.fn()} query={query} context="customers" />);
    expect(headers()).toContain('SĐT');
    fireEvent.click(screen.getAllByText('Chưa có SĐT')[0]);
    expect(headers()).not.toContain('SĐT');
    expect(headers()).toContain('Email');
    expect(screen.getByText('Chưa có email')).toBeTruthy();
  });

  it('cột "Thông tin": bấm Xem mở modal chi tiết của ĐÚNG khách (kèm context)', () => {
    withRow();
    render(<ReportCustomersModal drill={{ metric: 'total' }} onClose={vi.fn()} query={query} context="customers" />);
    expect(headers()).toContain('Thông tin');
    fireEvent.click(screen.getByText('Xem'));
    expect(detailSpy.mock.calls.at(-1)).toEqual([1, 'customers']);
  });

  it('lọc nhanh ngày "Tuần trước" gửi dateFrom/dateTo (Thứ 2 -> CN); bấm lại để bỏ', () => {
    withRow();
    render(<ReportCustomersModal drill={{ metric: 'total' }} onClose={vi.fn()} query={query} context="customers" />);
    fireEvent.click(screen.getByText('Tuần trước'));
    const q = listSpy.mock.calls.at(-1)![0];
    expect(q.dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(q.dateFrom).getDay()).toBe(1);
    expect(new Date(q.dateTo).getDay()).toBe(0);
    fireEvent.click(screen.getByText('Tuần trước'));
    expect(listSpy.mock.calls.at(-1)![0].dateFrom).toBeUndefined();
  });

  it('metricTabs + summary: chuyển "Đã chốt" gửi đúng metric; hiện dải số tóm tắt', () => {
    withRow();
    render(
      <ReportCustomersModal
        drill={{ metric: 'total', label: 'Khách của Sales One', preset: { salesUserId: 5 }, metricTabs: [{ metric: 'total', label: 'Data mới' }, { metric: 'closed', label: 'Đã chốt' }], summary: [{ label: 'Đã chốt trong kỳ', value: '7' }] }}
        onClose={vi.fn()}
        query={query}
        context="customers"
      />,
    );
    expect(screen.getByText('Khách của Sales One')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    fireEvent.click(screen.getByText('Đã chốt'));
    expect(listSpy.mock.calls.at(-1)![0]).toMatchObject({ metric: 'closed', salesUserId: 5 });
  });

  it('xem khách của 1 Sales cụ thể (preset.salesUserId) -> ẩn nút lọc nhanh \"Chưa có Sales\"', () => {
    withRow();
    render(<ReportCustomersModal drill={{ metric: 'total', preset: { salesUserId: 5 } }} onClose={vi.fn()} query={query} context="customers" />);
    expect(screen.queryByText('Chưa có Sales')).toBeNull();
    expect(screen.getByText('Chưa có Marketing')).toBeTruthy();
  });

  it('không preset Sales (xem tổng) -> vẫn hiện \"Chưa có Sales\"', () => {
    withRow();
    render(<ReportCustomersModal drill={{ metric: 'total' }} onClose={vi.fn()} query={query} context="customers" />);
    expect(screen.getByText('Chưa có Sales')).toBeTruthy();
  });

  it('getQuickOptions: ẩn/hiện động theo metric + preset', () => {
    const vals = (m: Parameters<typeof getQuickOptions>[0], p?: Parameters<typeof getQuickOptions>[1]) => getQuickOptions(m, p).map((o) => o.value);
    expect(vals('total')).toEqual(['all', 'no_marketing', 'no_sales', 'no_phone']);
    expect(vals('total', { salesUserId: 1 })).toEqual(['all', 'no_marketing', 'no_phone']);
    expect(vals('unassigned_marketing')).toEqual(['all', 'no_sales', 'no_phone']);
    expect(vals('unassigned_marketing', { marketingUserId: 3 })).toEqual(['all', 'no_sales', 'no_phone']);
  });
});
