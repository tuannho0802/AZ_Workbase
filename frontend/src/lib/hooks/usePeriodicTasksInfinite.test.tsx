/**
 * Agenda/Kanban/Calendar TẢI DẦN: lần đầu chỉ 1 request `limit` nhỏ của đúng khoảng ngày; trang sau chỉ tải khi
 * `fetchNextPage`; hết trang thì `hasNextPage=false`; gộp trang khử trùng id; nhãn checklist ghi được vào cache dạng pages.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { InternalAxiosRequestConfig, AxiosResponse } from 'axios';

vi.mock('../stores/auth.store', () => ({
  useAuthStore: { getState: () => ({ accessToken: null, refreshToken: null, logoutLocal: vi.fn() }), persist: { rehydrate: async () => {} } },
}));
vi.mock('@/components/common/AntdAppProvider', () => ({ showMessage: { error: vi.fn() } }));

import axiosInstance from '../api/axios-instance';
import { usePeriodicTasksInfinite, flattenTaskPages, VIEW_PAGE_SIZE } from './usePeriodicTasks';
import { patchTaskChecklistProgress } from '../utils/periodicTaskInvalidation';

const TOTAL = 45; // 20 + 20 + 5
let requests: Array<Record<string, unknown>> = [];

function installFakeBackend() {
  requests = [];
  axiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const params = (config.params ?? {}) as { page: number; limit: number };
    requests.push(params);
    const from = (params.page - 1) * params.limit;
    const rows = Array.from({ length: Math.max(0, Math.min(params.limit, TOTAL - from)) }, (_, i) => ({
      id: 1000 - (from + i),
      checklistProgress: { done: 0, total: 1 },
    }));
    const data = { data: rows, total: TOTAL, page: params.page, limit: params.limit, totalPages: Math.ceil(TOTAL / params.limit) };
    return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} } as AxiosResponse;
  };
}

const PARAMS = { limit: VIEW_PAGE_SIZE, dateFrom: '2026-10-05', dateTo: '2026-10-11' };

function setup(enabled = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30000 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...renderHook(() => usePeriodicTasksInfinite(PARAMS, enabled), { wrapper }) };
}

describe('usePeriodicTasksInfinite - tải dần theo trang', () => {
  beforeEach(() => installFakeBackend());

  it('I1 - Lần đầu CHỈ 1 request, limit=VIEW_PAGE_SIZE, page=1 (không còn tải 100)', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ page: 1, limit: VIEW_PAGE_SIZE, dateFrom: '2026-10-05', dateTo: '2026-10-11' });
    expect(VIEW_PAGE_SIZE).toBeLessThan(100);
    expect(result.current.hasNextPage).toBe(true);
  });

  it('I2 - fetchNextPage tải đúng page 2, 3 rồi hết trang (hasNextPage=false); đủ 45 dòng, không trùng', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.data).toBeDefined());
    await act(async () => { await result.current.fetchNextPage(); });
    await act(async () => { await result.current.fetchNextPage(); });
    expect(requests.map((r) => r.page)).toEqual([1, 2, 3]);
    expect(result.current.hasNextPage).toBe(false);
    const rows = flattenTaskPages(result.current.data?.pages);
    expect(rows).toHaveLength(TOTAL);
    expect(new Set(rows.map((r) => r.id)).size).toBe(TOTAL);
  });

  it('I3 - enabled=false (đang ở view Bảng/Thùng rác) -> 0 request', async () => {
    setup(false);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(requests).toHaveLength(0);
  });
});

describe('flattenTaskPages', () => {
  it('khử trùng id khi 2 trang chồng nhau (Task mới chen vào giữa 2 lần tải), giữ thứ tự', () => {
    const out = flattenTaskPages([{ data: [{ id: 3 }, { id: 2 }] }, { data: [{ id: 2 }, { id: 1 }] }]);
    expect(out.map((r) => r.id)).toEqual([3, 2, 1]);
    expect(flattenTaskPages(undefined)).toEqual([]);
  });
});

describe('patchTaskChecklistProgress - cache dạng infinite (pages)', () => {
  const progress = { done: 2, total: 5 };

  it('ghi đúng dòng ở trang chứa nó, trang khác giữ nguyên tham chiếu', () => {
    const p1 = { data: [{ id: 1, checklistProgress: { done: 0, total: 1 } }] };
    const p2 = { data: [{ id: 2, checklistProgress: { done: 0, total: 1 } }] };
    const next = patchTaskChecklistProgress({ pages: [p1, p2], pageParams: [1, 2] }, 2, progress);
    expect(next.pages[1].data[0].checklistProgress).toEqual(progress);
    expect(next.pages[0]).toBe(p1);
    expect(next.pageParams).toEqual([1, 2]);
  });

  it('không có dòng khớp -> trả CHÍNH object cũ (không render thừa); dạng { data } thường vẫn chạy', () => {
    const old = { pages: [{ data: [{ id: 1 }] }], pageParams: [1] };
    expect(patchTaskChecklistProgress(old, 99, progress)).toBe(old);
    const plain = patchTaskChecklistProgress({ data: [{ id: 7 }] }, 7, progress);
    expect(plain.data[0]).toMatchObject({ id: 7, checklistProgress: progress });
  });
});
