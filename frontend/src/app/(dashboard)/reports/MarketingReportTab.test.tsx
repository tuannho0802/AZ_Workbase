import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { MarketingReport, MarketingUserRow } from '@/lib/types/reports.types';

const mk = (o: Partial<MarketingUserRow>): MarketingUserRow => ({
  userId: 7,
  userName: 'Mai Marketing',
  departmentId: 1,
  departmentName: 'Marketing',
  totalCustomers: 10,
  closedCustomers: 2,
  joinedGroupCustomers: 2,
  depositedCustomers: 3,
  revenue: 1500.5,
  cohortDepositedCustomers: 4,
  byStatus: { pending: 8, closed: 2 },
  ...o,
});

const metrics = { totalCustomers: 15, closedCustomers: 2, joinedGroupCustomers: 2, depositedCustomers: 4, revenue: 1700.5, cohortDepositedCustomers: 4 };

const fixture: MarketingReport = {
  period: { type: 'month', from: '2026-09-01 00:00:00', to: '2026-09-30 23:59:59', granularity: 'day', spanDays: 30 },
  previousPeriod: { from: '2026-08-01 00:00:00', to: '2026-08-31 23:59:59' },
  appliedFilters: {},
  ownOnly: false,
  options: {
    marketers: [{ id: 7, name: 'Mai Marketing', departmentName: 'Marketing' }],
    creators: [{ id: 3, name: 'Lan Creator', departmentName: 'Marketing' }],
    sources: ['Facebook'],
  },
  statuses: [
    { code: 'pending', name: 'Chờ xử lý', color: 'gold' },
    { code: 'closed', name: 'Đã chốt', color: 'green' },
  ],
  summary: { current: metrics, previous: { ...metrics, revenue: 1000 }, unassignedMarketingCustomers: 5, totalByStatus: { pending: 13, closed: 2 } },
  attribution: { noMarketing: 5, sameCreatorAndMarketing: 6, differentCreatorAndMarketing: 4 },
  marketing: [mk({}), mk({ userId: 0, userName: '(Chưa gán Marketing)', departmentId: null, departmentName: null, revenue: 0, depositedCustomers: 0 })],
  creators: [mk({ userId: 3, userName: 'Lan Creator' })],
  bySource: [{ source: 'Facebook', ...metrics }],
  trend: [{ date: '2026-09-03', newCustomers: 4, closedCustomers: 1, revenue: 500, depositedCustomers: 2 }],
};

let hookResult: Record<string, unknown> = {};
vi.mock('@/lib/hooks/useReports', () => ({ useMarketingReport: () => hookResult }));

// Modal Mini Table có hook riêng cần QueryClient -> thay bằng stub để kiểm tra đúng "bấm gì thì mở gì".
vi.mock('./ReportCustomersModal', () => ({
  default: ({ drill }: { drill: { metric: string } | null }) => <div data-testid="drill">{drill?.metric}</div>,
}));

import MarketingReportTab from './MarketingReportTab';

describe('MarketingReportTab', () => {
  const props = { query: { period: 'month' as const, anchor: '2026-09-15' }, onQueryChange: vi.fn() };

  it('render đủ KPI, cảnh báo chưa gán Marketing và bảng chi tiết theo Marketing', () => {
    hookResult = { data: fixture, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn() };
    render(<MarketingReportTab {...props} />);
    expect(screen.getByText('Khách đã nạp tiền')).toBeTruthy();
    expect(screen.getByText(/data mới trong kỳ chưa gán Marketing phụ trách/)).toBeTruthy();
    expect(screen.getAllByText('Mai Marketing').length).toBeGreaterThan(0);
    expect(screen.getByText('Chi tiết theo nhân viên')).toBeTruthy();
  });

  it('scope own -> hiện ghi chú chỉ xem số của mình', () => {
    hookResult = { data: { ...fixture, ownOnly: true }, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn() };
    render(<MarketingReportTab {...props} />);
    expect(screen.getByText('Bạn chỉ xem được số liệu của chính mình')).toBeTruthy();
  });

  it('chưa có data (đang tải) không crash', () => {
    hookResult = { data: undefined, isLoading: true, isFetching: true, isError: false, error: null, refetch: vi.fn() };
    expect(() => render(<MarketingReportTab {...props} />)).not.toThrow();
  });

  it('không còn bộ lọc phòng ban khách hàng', () => {
    hookResult = { data: fixture, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn() };
    render(<MarketingReportTab {...props} />);
    expect(screen.queryByText('Phòng ban khách hàng')).toBeNull();
  });

  it('bấm thẻ KPI / nút của cảnh báo chưa gán -> mở Mini Table đúng chỉ số', () => {
    hookResult = { data: fixture, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn() };
    render(<MarketingReportTab {...props} />);
    expect(screen.queryByTestId('drill')).toBeNull();
    fireEvent.click(screen.getByText('Khách đã nạp tiền'));
    expect(screen.getByTestId('drill').textContent).toBe('deposited');
    fireEvent.click(screen.getByText('Xem danh sách khách'));
    expect(screen.getByTestId('drill').textContent).toBe('unassigned_marketing');
  });
});
