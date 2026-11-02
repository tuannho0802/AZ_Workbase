import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

const preview = vi.hoisted(() => vi.fn());
const exportExcel = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/leave-export.api', () => ({ leaveExportApi: { preview, exportExcel } }));

import LeaveExportModal from './LeaveExportModal';

const model = {
  form: 'A',
  title: 'Tổng hợp theo nhân viên',
  period: { type: 'month', from: '2026-09-01', to: '2026-09-30' },
  isEmpty: false,
  sheets: [
    {
      name: 'Theo nhân viên',
      charts: [],
      tables: [
        {
          id: 'employees',
          title: 'Tổng hợp theo nhân viên',
          columns: [
            { key: 'name', header: 'Nhân viên', type: 'text' },
            { key: 'rate', header: 'Tỷ lệ duyệt (%)', type: 'number' },
          ],
          rows: [['An', null], ['Bình', 50]],
          totalRows: 45,
          truncated: true,
        },
      ],
    },
  ],
};

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <App>
        <LeaveExportModal open onClose={vi.fn()} query={{ period: 'month', anchor: '2026-09-15' }} filters={{ departmentId: 2 }} />
      </App>
    </QueryClientProvider>,
  );
}

describe('LeaveExportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    preview.mockResolvedValue(model);
  });

  it('bước 1 chưa gọi API; sang bước 2 gọi preview đúng body (kỳ + bộ lọc + form)', async () => {
    renderModal();
    expect(preview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Xem trước'));
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    expect(preview).toHaveBeenCalledWith({ period: 'month', anchor: '2026-09-15', departmentId: 2, form: 'A' });
  });

  it('Demo: tỷ lệ null hiện "—" (không ép 0) và báo còn bao nhiêu dòng trong file', async () => {
    renderModal();
    fireEvent.click(screen.getByText('Xem trước'));
    await screen.findByText('Bình');
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/còn 43 dòng nữa/)).toBeInTheDocument();
  });

  it('bấm Xuất Excel 2 lần liên tiếp chỉ gọi API 1 lần', async () => {
    let resolve!: (v: string) => void;
    exportExcel.mockReturnValue(new Promise<string>((r) => (resolve = r)));
    renderModal();
    fireEvent.click(screen.getByText('Xem trước'));
    await screen.findByText('Bình');
    const btn = screen.getByRole('button', { name: /Xuất Excel/ });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(exportExcel).toHaveBeenCalledTimes(1);
    resolve('a.xlsx');
    await waitFor(() => expect(screen.getByRole('button', { name: /Xuất Excel/ })).not.toBeDisabled());
  });

  it('preview lỗi -> hiện lỗi và khoá nút Xuất Excel', async () => {
    preview.mockRejectedValue({ response: { data: { message: 'Bạn không có phạm vi dữ liệu' } } });
    renderModal();
    fireEvent.click(screen.getByText('Xem trước'));
    await screen.findByText('Bạn không có phạm vi dữ liệu');
    expect(screen.getByRole('button', { name: /Xuất Excel/ })).toBeDisabled();
  });

  const charts = [
    { id: 'employeeStacked', type: 'barStacked', title: 'Đơn theo nhân viên (top 2)', tableId: 'employees', categoryKey: 'name', categories: ['An', 'Bình'], series: [{ key: 'rate', name: 'Tỷ lệ', color: '2E7D32', values: [1, 2] }] },
    { id: 'typeDonut', type: 'doughnut', title: 'Cơ cấu loại phép (số đơn)', tableId: 'employees', categoryKey: 'name', categories: ['An', 'Bình'], series: [{ key: 'rate', name: 'Tỷ lệ', color: '1677FF', values: [1, 2] }], pointColors: ['1677FF', '52C41A'] },
    { id: 'trendLine', type: 'line', title: 'Xu hướng số đơn theo thời gian', tableId: 'employees', categoryKey: 'name', categories: ['An', 'Bình'], series: [{ key: 'rate', name: 'Tỷ lệ', color: 'D32F2F', values: [1, null] }] },
  ];

  it('form E: chọn E gửi form=E; Demo hiện đủ 3 chart của model cạnh bảng', async () => {
    preview.mockResolvedValue({ ...model, form: 'E', sheets: [{ ...model.sheets[0], charts }] });
    renderModal();
    fireEvent.click(screen.getByText(/E\. Báo cáo kèm biểu đồ/));
    fireEvent.click(screen.getByText('Xem trước'));
    await screen.findByTestId('preview-chart-employeeStacked');
    expect(screen.getByTestId('preview-chart-typeDonut')).toBeInTheDocument();
    expect(screen.getByTestId('preview-chart-trendLine')).toBeInTheDocument();
    expect(screen.getByText('Cơ cấu loại phép (số đơn)')).toBeInTheDocument();
    expect(screen.getByText('Bình')).toBeInTheDocument(); // bảng vẫn hiện cạnh chart
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ form: 'E' }));
  });

  it('form A (không chart) không render khung chart nào', async () => {
    renderModal();
    fireEvent.click(screen.getByText('Xem trước'));
    await screen.findByText('Bình');
    expect(screen.queryByTestId(/^preview-chart-/)).not.toBeInTheDocument();
  });

  it('kỳ rỗng form E: hiện thông báo, không chart, không lỗi', async () => {
    preview.mockResolvedValue({ ...model, form: 'E', isEmpty: true, notice: 'Không có dữ liệu trong kỳ đã chọn', sheets: [{ ...model.sheets[0], charts: [], tables: [{ ...model.sheets[0].tables[0], rows: [], totalRows: 0, truncated: false }] }] });
    renderModal();
    fireEvent.click(screen.getByText(/E\. Báo cáo kèm biểu đồ/));
    fireEvent.click(screen.getByText('Xem trước'));
    await screen.findByText('Không có dữ liệu trong kỳ đã chọn');
    expect(screen.queryByTestId(/^preview-chart-/)).not.toBeInTheDocument();
  });

  it('form F: nhiều sheet -> chart nằm ở tab Báo cáo', async () => {
    preview.mockResolvedValue({
      ...model,
      form: 'F',
      sheets: [model.sheets[0], { ...model.sheets[0], name: 'Báo cáo', charts }],
    });
    renderModal();
    fireEvent.click(screen.getByText(/F\. Gói đầy đủ/));
    fireEvent.click(screen.getByText('Xem trước'));
    fireEvent.click(await screen.findByRole('tab', { name: 'Báo cáo' }));
    expect(await screen.findByTestId('preview-chart-trendLine')).toBeInTheDocument();
  });
});
