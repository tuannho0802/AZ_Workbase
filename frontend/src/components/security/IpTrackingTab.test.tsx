import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import dayjs from 'dayjs';
import { IpTrackingTab } from './IpTrackingTab';
import { securityApi } from '@/lib/api/security.api';
import { getThisWeekRange, getTodayRange } from '@/lib/utils/periodicTaskRange';

vi.mock('@/lib/api/security.api', () => ({
  securityApi: { getIpAccess: vi.fn(), getIpAccessDetail: vi.fn() },
}));
vi.mock('./IpWithFlag', () => ({ IpWithFlag: ({ ip }: { ip: string }) => <span>{ip}</span> }));

const FMT = 'YYYY-MM-DD';
const renderTab = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <App>
        <IpTrackingTab />
      </App>
    </QueryClientProvider>,
  );
};

describe('IpTrackingTab - lọc theo khoảng thời gian', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (securityApi.getIpAccess as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
  });

  it('mặc định chỉ tải TUẦN NÀY (Thứ 2 -> CN), đúng 1 request lúc mở', async () => {
    renderTab();
    const [from, to] = getThisWeekRange();
    await waitFor(() => expect(securityApi.getIpAccess).toHaveBeenCalledTimes(1));
    expect(securityApi.getIpAccess).toHaveBeenCalledWith(
      expect.objectContaining({ fromDate: from.format(FMT), toDate: to.format(FMT), page: 1 }),
    );
    expect(screen.getByRole('button', { name: 'Tuần này' })).toHaveClass('ant-btn-primary');
  });

  it('bấm "Hôm nay" -> gọi lại với đúng khoảng 1 ngày, về trang 1; có đủ 5 nút lọc nhanh', async () => {
    renderTab();
    await waitFor(() => expect(securityApi.getIpAccess).toHaveBeenCalledTimes(1));
    for (const label of ['Hôm nay', 'Tuần này', 'Tuần trước', 'Tháng này', 'Tháng trước']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Hôm nay' }));
    const [today] = getTodayRange();
    await waitFor(() => expect(securityApi.getIpAccess).toHaveBeenCalledTimes(2));
    expect(securityApi.getIpAccess).toHaveBeenLastCalledWith(
      expect.objectContaining({ fromDate: today.format(FMT), toDate: dayjs().format(FMT), page: 1 }),
    );
  });

  it('bấm lại đúng khoảng đang chọn -> không gọi API thừa (cache theo khoảng)', async () => {
    renderTab();
    await waitFor(() => expect(securityApi.getIpAccess).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Tuần này' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(securityApi.getIpAccess).toHaveBeenCalledTimes(1);
  });
});
