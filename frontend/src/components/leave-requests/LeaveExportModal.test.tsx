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
});
