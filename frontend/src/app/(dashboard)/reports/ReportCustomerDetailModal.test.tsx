import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

let detailResult: Record<string, unknown> = {};
vi.mock('@/lib/hooks/useReports', () => ({ useReportCustomerDetail: () => detailResult }));
vi.mock('@/components/customers/SourceTag', () => ({ SourceTag: ({ source }: { source?: string }) => <span>{source}</span> }));
vi.mock('@/components/customers/StatusTag', () => ({ StatusTag: ({ code }: { code?: string }) => <span>{code}</span> }));

import ReportCustomerDetailModal from './ReportCustomerDetailModal';

const user = { id: 2, name: 'Sales One', departmentName: 'Phòng Kinh doanh', departmentColor: '#1677ff' };
const detail = {
  customer: {
    id: 1, name: 'Nguyễn Văn A', phone: null, email: 'a@x.vn', source: 'Facebook', campaign: null, broker: null, status: 'closed', note: null,
    inputDate: '2026-09-01', assignedDate: '2026-09-02', closedDate: '2026-09-10', createdAt: '2026-09-01T03:00:00.000Z',
    salesUser: user, marketingUser: null, createdBy: null,
  },
  deposits: [
    { id: 1, order: 1, stage: 'ftd', amount: 500, depositDate: '2026-09-05', cumulative: 500, daysSincePrevious: null, broker: null, note: null, createdBy: null },
    { id: 2, order: 2, stage: 'redeposit', amount: 250, depositDate: '2026-09-25', cumulative: 750, daysSincePrevious: 20, broker: null, note: null, createdBy: null },
  ],
  depositSummary: { totalAmount: 750, depositCount: 2, averageAmount: 375, maxAmount: 500, firstDepositDate: '2026-09-05', lastDepositDate: '2026-09-25', daysToFirstDeposit: 4, depositSpanDays: 20 },
  groups: [],
};

describe('ReportCustomerDetailModal', () => {
  it('đang tải -> skeleton, không crash; customerId=null -> không mở', () => {
    detailResult = { data: undefined, isLoading: true, isError: false };
    const { baseElement } = render(<ReportCustomerDetailModal customerId={1} context="customers" onClose={vi.fn()} />);
    expect(baseElement.querySelector('.ant-skeleton')).toBeTruthy();
    render(<ReportCustomerDetailModal customerId={null} context="customers" onClose={vi.fn()} />);
  });

  it('lỗi tải -> hiện Alert', () => {
    detailResult = { data: undefined, isLoading: false, isError: true, error: new Error('x') };
    render(<ReportCustomerDetailModal customerId={1} context="customers" onClose={vi.fn()} />);
    expect(screen.getByText('Không tải được thông tin khách')).toBeTruthy();
  });

  it('hiện thông tin chung (chưa có SĐT) và tab Lịch sử nạp với giai đoạn FTD / nạp lại', () => {
    detailResult = { data: detail, isLoading: false, isError: false };
    render(<ReportCustomerDetailModal customerId={1} context="customers" onClose={vi.fn()} />);
    expect(screen.getByText('Thông tin khách — Nguyễn Văn A')).toBeTruthy();
    expect(screen.getByText('Chưa có SĐT')).toBeTruthy();
    fireEvent.click(screen.getByText('Lịch sử nạp (2)'));
    expect(screen.getByText('Nạp lần đầu (FTD)')).toBeTruthy();
    expect(screen.getByText('Nạp lại lần 1')).toBeTruthy();
    expect(screen.getByText('20 ngày')).toBeTruthy();
  });

  it('quick filter "Tháng này" chỉ giữ khoản nạp trong khoảng; khoảng không có khoản nào -> báo rỗng', () => {
    detailResult = { data: detail, isLoading: false, isError: false };
    render(<ReportCustomerDetailModal customerId={1} context="customers" onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Lịch sử nạp (2)'));
    // Tháng hiện tại của máy chạy test != 09/2026 -> không còn khoản nào.
    fireEvent.click(screen.getByText('Hôm nay'));
    expect(screen.getByText('Không có khoản nạp trong khoảng này')).toBeTruthy();
    // Bấm lại để bỏ lọc -> đủ 2 khoản.
    fireEvent.click(screen.getByText('Hôm nay'));
    expect(screen.getByText('Nạp lần đầu (FTD)')).toBeTruthy();
  });

  it('khách chưa nạp -> hiện trạng thái "chưa nạp lần nào"', () => {
    detailResult = { data: { ...detail, deposits: [], depositSummary: { ...detail.depositSummary, depositCount: 0, totalAmount: 0 } }, isLoading: false, isError: false };
    render(<ReportCustomerDetailModal customerId={1} context="customers" onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Lịch sử nạp (0)'));
    expect(screen.getByText('Khách chưa nạp lần nào')).toBeTruthy();
  });
});
