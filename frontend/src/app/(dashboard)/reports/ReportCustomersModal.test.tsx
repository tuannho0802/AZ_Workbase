import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let listResult: Record<string, unknown> = {};
const listSpy = vi.fn();
vi.mock('@/lib/hooks/useReports', () => ({
  useReportCustomerList: (q: unknown, enabled: boolean) => {
    listSpy(q, enabled);
    return listResult;
  },
}));
vi.mock('@/lib/hooks/useCustomerStatuses', () => ({ useCustomerStatuses: () => ({ statuses: [{ code: 'pending', name: 'Chờ xử lý', color: '#faad14' }] }) }));
vi.mock('@/lib/hooks/useMediaSources', () => ({ useMediaSources: () => ({ sources: [{ id: 1, name: 'Facebook' }] }) }));
vi.mock('@/components/customers/SourceTag', () => ({ SourceTag: ({ source }: { source?: string }) => <span>{source}</span> }));
vi.mock('@/components/customers/StatusTag', () => ({ StatusTag: ({ code }: { code?: string }) => <span>{code}</span> }));

import ReportCustomersModal from './ReportCustomersModal';

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
});
