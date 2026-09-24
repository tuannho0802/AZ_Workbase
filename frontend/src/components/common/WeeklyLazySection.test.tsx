import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WeeklyLazySection } from './WeeklyLazySection';

// AntD cần matchMedia (Table/Grid responsive) trong jsdom.
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

interface Row { id: number; name: string }

describe('WeeklyLazySection', () => {
  it('chỉ fetch tuần đầu (đang mở), KHÔNG fetch các tuần đóng', async () => {
    const fetchWeek = vi.fn(async () => ({ data: [{ id: 1, name: 'dòng-tuần-mới' }], weekTotal: 1 }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <WeeklyLazySection<Row>
          weeks={[{ weekStart: '2026-09-21', count: 1 }, { weekStart: '2026-09-14', count: 5 }]}
          fetchWeek={fetchWeek}
          resetKey={1}
          rowKey="id"
          columns={[{ title: 'Tên', dataIndex: 'name', key: 'name' }]}
          emptyText="trống"
          pagination={{ current: 1, pageSize: 4, total: 2, onChange: () => {} }}
        />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('dòng-tuần-mới')).toBeTruthy());
    expect(fetchWeek).toHaveBeenCalledTimes(1);
    expect(fetchWeek).toHaveBeenCalledWith('2026-09-21', 1, 20);
  });

  it('không có tuần nào -> hiện emptyText', () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <WeeklyLazySection<Row>
          weeks={[]} fetchWeek={vi.fn()} resetKey={1} rowKey="id" columns={[]} emptyText="trống"
          pagination={{ current: 1, pageSize: 4, total: 0, onChange: () => {} }}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText('trống')).toBeTruthy();
  });
});
