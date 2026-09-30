import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { App } from 'antd';
import type { UtmStatsResult } from '@/lib/api/utms.api';
import { UtmStatsTab } from './UtmStatsTab';

if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom không có kích thước layout -> Recharts không vẽ; stub để chỉ kiểm tra dữ liệu đưa vào chart.
const barKeys: string[] = [];
let chartData: Array<Record<string, unknown>> = [];
vi.mock('recharts', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Pass,
    BarChart: ({ data, children }: { data: Array<Record<string, unknown>>; children?: React.ReactNode }) => {
      chartData = data;
      return <div data-testid="bar-chart">{children}</div>;
    },
    Bar: ({ dataKey }: { dataKey: string }) => {
      barKeys.push(dataKey);
      return null;
    },
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Legend: () => null,
    Tooltip: () => null,
  };
});

let stats: UtmStatsResult;
let lastParams: unknown;
vi.mock('@/lib/hooks/useUtms', () => ({
  useUtmStats: (params: unknown) => {
    lastParams = params;
    return { data: stats, isLoading: false, isError: false, error: null };
  },
}));

const base = (): UtmStatsResult => ({
  range: { from: '2026-09-28', to: '2026-09-30', granularity: 'day' },
  utmScope: 'own',
  customerScope: 'own',
  utmCount: 2,
  statuses: [
    { code: 'pending', name: 'Chờ xử lý', color: '#faad14' },
    { code: 'closed', name: 'Đã chốt', color: '#52c41a' },
    { code: 'lost', name: 'Mất', color: '#f5222d' },
  ],
  utms: [
    { id: 1, name: 'FB_Q4', color: '#1677ff', isActive: true },
    { id: 2, name: 'TT_Q4', color: '#722ed1', isActive: false },
  ],
  totals: { total: 4, byStatus: { pending: 3, closed: 1, lost: 0 } },
  series: [
    { date: '2026-09-28', total: 4, byStatus: { pending: 3, closed: 1, lost: 0 } },
    { date: '2026-09-29', total: 0, byStatus: { pending: 0, closed: 0, lost: 0 } },
    { date: '2026-09-30', total: 0, byStatus: { pending: 0, closed: 0, lost: 0 } },
  ],
  byUtm: [{ utmId: 1, total: 4, byStatus: { pending: 3, closed: 1, lost: 0 } }],
});

const renderTab = () =>
  render(
    <App>
      <UtmStatsTab />
    </App>,
  );

describe('UtmStatsTab', () => {
  beforeEach(() => {
    stats = base();
    barKeys.length = 0;
    chartData = [];
  });

  it('gọi API với khoảng 30 ngày gần nhất, chưa lọc UTM', () => {
    renderTab();
    const p = lastParams as { from: string; to: string; utmId?: number };
    expect(p.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.utmId).toBeUndefined();
  });

  it('hiện nhãn phạm vi theo scope utms.view của BE', () => {
    stats.utmScope = 'department';
    renderTab();
    expect(screen.getByText(/phòng ban bạn quản lý/)).toBeTruthy();
  });

  it('chart chỉ vẽ các giai đoạn CÓ khách (bỏ giai đoạn 0 khách), số liệu theo ngày đúng', () => {
    renderTab();
    expect(barKeys).toEqual(['pending', 'closed']);
    expect(chartData).toHaveLength(3);
    expect(chartData[0]).toMatchObject({ pending: 3, closed: 1, total: 4 });
  });

  it('bảng theo ngày: ẩn ngày không có khách mặc định, hiện số + tỷ lệ; dòng "Cả kỳ"', () => {
    renderTab();
    const tables = screen.getAllByRole('table');
    const dayTable = tables[0];
    expect(within(dayTable).getByText('28/09/2026')).toBeTruthy();
    expect(within(dayTable).queryByText('29/09/2026')).toBeNull();
    expect(within(dayTable).getAllByText('(75%)').length).toBeGreaterThan(0);
    expect(within(dayTable).getByText('Cả kỳ')).toBeTruthy();
  });

  it('bảng theo UTM hiện Tag UTM', () => {
    renderTab();
    expect(screen.getByText('FB_Q4')).toBeTruthy();
  });

  it('không có khách trong kỳ -> Empty thay cho chart', () => {
    stats.totals = { total: 0, byStatus: { pending: 0, closed: 0, lost: 0 } };
    stats.series = stats.series.map((p) => ({ ...p, total: 0, byStatus: { pending: 0, closed: 0, lost: 0 } }));
    stats.byUtm = [];
    renderTab();
    expect(screen.getByText('Chưa có khách nào trong kỳ với bộ lọc này')).toBeTruthy();
    expect(screen.queryByTestId('bar-chart')).toBeNull();
  });

  it('customerScope null -> cảnh báo chưa có quyền xem khách', () => {
    stats.customerScope = null;
    renderTab();
    expect(screen.getByText(/chưa có quyền xem khách hàng/)).toBeTruthy();
  });

  it('kỳ gộp theo tháng -> hiện ghi chú và nhãn tháng', () => {
    stats.range = { from: '2026-06-01', to: '2026-09-30', granularity: 'month' };
    stats.series = [{ date: '2026-09', total: 4, byStatus: { pending: 3, closed: 1, lost: 0 } }];
    renderTab();
    expect(screen.getByText(/gộp theo tháng/)).toBeTruthy();
    expect(screen.getByText('Tháng 09/2026')).toBeTruthy();
  });
});
