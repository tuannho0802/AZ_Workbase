import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
const barClicks: Record<string, (entry: unknown) => void> = {};
let chartData: Array<Record<string, unknown>> = [];
vi.mock('recharts', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Pass,
    BarChart: ({ data, children }: { data: Array<Record<string, unknown>>; children?: React.ReactNode }) => {
      chartData = data;
      return <div data-testid="bar-chart">{children}</div>;
    },
    Bar: ({ dataKey, onClick }: { dataKey: string; onClick?: (entry: unknown) => void }) => {
      barKeys.push(dataKey);
      if (onClick) barClicks[dataKey] = onClick;
      return null;
    },
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Legend: () => null,
    Tooltip: () => null,
  };
});

// Drawer thật có test riêng (UtmStatsCustomersDrawer.test.tsx) - ở đây chỉ kiểm tra tab mở đúng ngữ cảnh.
let drawerProps: { drill: { title: string; from: string; to: string; status?: string } | null; initialFilters: unknown } | null = null;
vi.mock('@/components/utms/UtmStatsCustomersDrawer', () => ({
  UtmStatsCustomersDrawer: (props: NonNullable<typeof drawerProps>) => {
    drawerProps = props;
    return null;
  },
}));

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
    { id: 1, name: 'FB_Q4', color: '#1677ff', isActive: true, primaryManager: { id: 10, name: 'Chính A' }, secondaryManagers: [{ id: 20, name: 'Phụ B' }] },
    { id: 2, name: 'TT_Q4', color: '#722ed1', isActive: false, primaryManager: { id: 11, name: 'Chính C' }, secondaryManagers: [] },
  ],
  totals: { total: 4, byStatus: { pending: 3, closed: 1, lost: 0 } },
  series: [
    { date: '2026-09-28', total: 4, byStatus: { pending: 3, closed: 1, lost: 0 } },
    { date: '2026-09-29', total: 0, byStatus: { pending: 0, closed: 0, lost: 0 } },
    { date: '2026-09-30', total: 0, byStatus: { pending: 0, closed: 0, lost: 0 } },
  ],
  byUtm: [{ utmId: 1, total: 4, byStatus: { pending: 3, closed: 1, lost: 0 } }],
});

const openSelect = (name: string) => fireEvent.mouseDown(screen.getByRole('combobox', { name }));
const clickOption = (text: string) => {
  const el = Array.from(document.querySelectorAll('.ant-select-item-option-content')).find((e) => e.textContent === text);
  if (!el) throw new Error(`Không thấy option "${text}"`);
  fireEvent.click(el);
};

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
    for (const k of Object.keys(barClicks)) delete barClicks[k];
    chartData = [];
    drawerProps = null;
  });

  it('gọi API với khoảng 30 ngày gần nhất, chưa lọc UTM', () => {
    renderTab();
    const p = lastParams as { from: string; to: string; utmIds?: number[]; primaryManagerId?: number; secondaryManagerId?: number };
    expect(p.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.utmIds).toBeUndefined();
    expect(p.primaryManagerId).toBeUndefined();
    expect(p.secondaryManagerId).toBeUndefined();
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

  describe('Quick Filter', () => {
    const optionTexts = () => Array.from(document.querySelectorAll('.ant-select-item-option-content')).map((e) => e.textContent);

    it('hiện đủ 4 dropdown: Quản lý chính, Quản lý phụ, UTM hoạt động, UTM đã khoá', () => {
      renderTab();
      expect(screen.getByRole('combobox', { name: 'Lọc theo Quản lý chính' })).toBeTruthy();
      expect(screen.getByRole('combobox', { name: 'Lọc theo Quản lý phụ' })).toBeTruthy();
      expect(screen.getByRole('combobox', { name: 'Lọc theo UTM hoạt động' })).toBeTruthy();
      expect(screen.getByRole('combobox', { name: 'Lọc theo UTM đã khoá' })).toBeTruthy();
    });

    it('dropdown Quản lý chính CHỈ liệt kê user đang có UTM', () => {
      renderTab();
      openSelect('Lọc theo Quản lý chính');
      expect(optionTexts()).toEqual(['Chính A', 'Chính C']);
    });

    it('dropdown Quản lý phụ CHỈ liệt kê user đang là Quản lý phụ của UTM nào đó', () => {
      renderTab();
      openSelect('Lọc theo Quản lý phụ');
      expect(optionTexts()).toEqual(['Phụ B']);
    });

    it('UTM hoạt động và UTM đã khoá tách thành 2 dropdown riêng', () => {
      renderTab();
      openSelect('Lọc theo UTM hoạt động');
      expect(optionTexts()).toEqual(['FB_Q4']);
      openSelect('Lọc theo UTM đã khoá');
      expect(optionTexts()).toContain('TT_Q4');
    });

    it('chọn Quản lý chính -> gửi primaryManagerId lên API', () => {
      renderTab();
      openSelect('Lọc theo Quản lý chính');
      clickOption('Chính C');
      expect((lastParams as { primaryManagerId?: number }).primaryManagerId).toBe(11);
    });

    it('chọn UTM hoạt động + UTM đã khoá -> gộp thành 1 utmIds', () => {
      renderTab();
      openSelect('Lọc theo UTM hoạt động');
      clickOption('FB_Q4');
      openSelect('Lọc theo UTM đã khoá');
      clickOption('TT_Q4');
      expect((lastParams as { utmIds?: number[] }).utmIds).toEqual([1, 2]);
    });
  });

  describe('Bấm chart/card -> Mini Table khách', () => {
    it('chưa bấm gì -> drawer đóng', () => {
      renderTab();
      expect(drawerProps?.drill).toBeNull();
    });

    it('bấm 1 đoạn cột (ngày + giai đoạn) -> mở với đúng ngày + trạng thái', () => {
      renderTab();
      act(() => barClicks.pending({ payload: { date: '2026-09-28' } }));
      expect(drawerProps?.drill).toMatchObject({ from: '2026-09-28', to: '2026-09-28', status: 'pending' });
      expect(drawerProps?.drill?.title).toContain('28/09/2026');
      expect(drawerProps?.drill?.title).toContain('Chờ xử lý');
    });

    it('bấm cột kỳ gộp tháng -> khoảng ngày cả tháng (cắt theo kỳ đang xem)', () => {
      stats.range = { from: '2026-06-15', to: '2026-09-20', granularity: 'month' };
      stats.series = [{ date: '2026-06', total: 4, byStatus: { pending: 3, closed: 1, lost: 0 } }];
      renderTab();
      act(() => barClicks.closed({ payload: { date: '2026-06' } }));
      expect(drawerProps?.drill).toMatchObject({ from: '2026-06-15', to: '2026-06-30', status: 'closed' });
    });

    it('bấm card "Khách trong kỳ" -> cả kỳ, không lọc trạng thái', () => {
      renderTab();
      fireEvent.click(screen.getByText('Khách trong kỳ'));
      expect(drawerProps?.drill).toMatchObject({ from: '2026-09-28', to: '2026-09-30' });
      expect(drawerProps?.drill?.status).toBeUndefined();
    });

    it('bấm card trạng thái -> lọc theo trạng thái đó', () => {
      renderTab();
      const card = screen.getAllByText('Đã chốt')[0].closest('.ant-card') as HTMLElement;
      fireEvent.click(card);
      expect(drawerProps?.drill).toMatchObject({ status: 'closed' });
    });

    it('không có khách trong kỳ -> card tổng không bấm được (không mở bảng rỗng); card "UTM được thống kê" không bao giờ bấm được', () => {
      stats.totals = { total: 0, byStatus: { pending: 0, closed: 0, lost: 0 } };
      renderTab();
      expect(screen.getByText('Khách trong kỳ').closest('.ant-card')?.getAttribute('role')).toBeNull();
      expect(screen.getByText('UTM được thống kê').closest('.ant-card')?.getAttribute('role')).toBeNull();
    });

    it('có khách -> card tổng là nút bấm được', () => {
      renderTab();
      expect(screen.getByText('Khách trong kỳ').closest('.ant-card')?.getAttribute('role')).toBe('button');
    });

    it('bộ lọc nhanh đang chọn được truyền làm giá trị khởi tạo cho bảng', () => {
      renderTab();
      openSelect('Lọc theo Quản lý chính');
      clickOption('Chính A');
      fireEvent.click(screen.getByText('Khách trong kỳ'));
      expect(drawerProps?.initialFilters).toMatchObject({ primaryManagerId: 10 });
    });
  });
});
