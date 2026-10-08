/**
 * SPEC ĐO SỐ LẦN GỌI ENDPOINT khi TICK / SỬA / XOÁ / DI CHUYỂN mục checklist
 * (nối tiếp `periodicTaskChecklistCallCount.test.tsx`, vốn chỉ phủ nhánh THÊM).
 *
 * Trước: mỗi thao tác invalidate cả `GET /periodic-tasks` (limit 100). Sau: BE trả `checklistProgress` ở
 * tick/xoá nên FE ghi thẳng vào cache list; sửa nội dung + di chuyển không đụng list; Guard đổi status
 * (`statusChanged`) hoặc BE cũ không trả tiến độ -> FALLBACK refetch đầy đủ như cũ.
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
import { usePeriodicTasks } from './usePeriodicTasks';
import {
  useTaskChecklistPage,
  useUpdateTaskChecklistItem,
  useRemoveTaskChecklistItem,
  useMoveTaskChecklistItem,
} from './usePeriodicTaskChecklistItems';

const TASK = 128;
const OTHER = 99;
const ITEM = 7;
const LIST_KEY = ['periodic-tasks', { page: 1, limit: 100, dateFrom: '2026-10-05', dateTo: '2026-10-11' }];

let calls: string[] = [];
const count = (key: string) => calls.filter((c) => c === key).length;
const snapshot = () => Object.fromEntries([...new Set(calls)].sort().map((k) => [k, count(k)]));

/** Phần BE (mock) trả thêm trong response PATCH/DELETE - mỗi test tự đặt. */
let extra: Record<string, unknown> = {};

function installFakeBackend() {
  calls = [];
  extra = {};
  axiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const path = String(config.url).split('?')[0];
    calls.push(`${String(config.method).toUpperCase()} ${path}`);
    let data: unknown = {};
    if (config.method === 'get') {
      data = {
        data: [
          { id: TASK, checklistProgress: { done: 0, total: 4 } },
          { id: OTHER, checklistProgress: { done: 3, total: 3 } },
        ],
        items: [], edges: [], total: 2, page: 1, limit: 100, totalPages: 1,
      };
    } else if (path.endsWith('/move')) {
      data = { moved: true };
    } else if (config.method === 'delete') {
      data = { deleted: true, ...extra };
    } else {
      data = { id: ITEM, content: 'x', isDone: true, ...extra };
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} } as AxiosResponse;
  };
}

let lastClient: QueryClient;
function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30000, gcTime: 300000, retry: false, refetchOnWindowFocus: false } },
  });
  lastClient = queryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => {
      usePeriodicTasks({ page: 1, limit: 100, dateFrom: '2026-10-05', dateTo: '2026-10-11' });
      useTaskChecklistPage(TASK, 1, true, {});
      return {
        update: useUpdateTaskChecklistItem(),
        remove: useRemoveTaskChecklistItem(),
        move: useMoveTaskChecklistItem(),
      };
    },
    { wrapper },
  );
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

async function ready() {
  const view = setup();
  await waitFor(() => expect(count('GET /periodic-tasks')).toBe(1));
  await waitFor(() => expect(count(`GET /periodic-tasks/${TASK}/checklist-items`)).toBe(1));
  await settle();
  calls = [];
  return view;
}

const listRow = (id: number) =>
  (lastClient.getQueryData<{ data: Array<{ id: number; checklistProgress: unknown }> }>(LIST_KEY)?.data ?? []).find((r) => r.id === id);

describe('Tick / sửa / xoá / di chuyển checklist - số lần gọi endpoint', () => {
  beforeEach(() => installFakeBackend());

  it('M1 - Tick (isDone đổi, BE trả checklistProgress): 0 GET list; nhãn ghi đúng số BE; dòng khác không đổi', async () => {
    extra = { checklistProgress: { done: 2, total: 5 }, checklistSummary: { total: 4, done: 2 } };
    const view = await ready();

    await act(async () => {
      await view.result.current.update.mutateAsync({ taskId: TASK, itemId: ITEM, data: { isDone: true } });
    });
    await settle();

    expect(count('GET /periodic-tasks')).toBe(0);
    expect(listRow(TASK)?.checklistProgress).toEqual({ done: 2, total: 5 });
    expect(listRow(OTHER)?.checklistProgress).toEqual({ done: 3, total: 3 });
    // [PERF] BE trả `checklistSummary` -> ghi thẳng vào trang đang mở, KHÔNG GET lại.
    expect(count(`GET /periodic-tasks/${TASK}/checklist-items`)).toBe(0);
    const page = lastClient.getQueryData<{ total: number; done: number }>(['periodic-tasks', 'checklist-page', TASK, 1, 'position', false]);
    expect(page).toMatchObject({ total: 4, done: 2 });
  });

  it('M1b - Tick nhưng BE CŨ không trả checklistSummary -> FALLBACK GET lại trang checklist (1 lần)', async () => {
    extra = { checklistProgress: { done: 2, total: 5 } };
    const view = await ready();

    await act(async () => {
      await view.result.current.update.mutateAsync({ taskId: TASK, itemId: ITEM, data: { isDone: true } });
    });
    await settle();

    expect(count(`GET /periodic-tasks/${TASK}/checklist-items`)).toBe(1);
  });

  it('M2 - Tick mà Guard đổi status (statusChanged) -> FALLBACK refetch list đầy đủ như cũ (1 lần)', async () => {
    extra = { statusChanged: true };
    const view = await ready();

    await act(async () => {
      await view.result.current.update.mutateAsync({ taskId: TASK, itemId: ITEM, data: { isDone: true } });
    });
    await settle();

    expect(count('GET /periodic-tasks')).toBe(1);
  });

  it('M3 - Tick nhưng BE CŨ không trả tiến độ -> FALLBACK refetch list (tương thích ngược)', async () => {
    const view = await ready();

    await act(async () => {
      await view.result.current.update.mutateAsync({ taskId: TASK, itemId: ITEM, data: { isDone: true } });
    });
    await settle();

    expect(count('GET /periodic-tasks')).toBe(1);
  });

  it('M4 - Chỉ sửa nội dung: 0 GET list, nhãn không đổi, trang checklist ghi từ response (0 GET)', async () => {
    const view = await ready();

    await act(async () => {
      await view.result.current.update.mutateAsync({ taskId: TASK, itemId: ITEM, data: { content: 'Mới' } });
    });
    await settle();

    expect(count('GET /periodic-tasks')).toBe(0);
    expect(listRow(TASK)?.checklistProgress).toEqual({ done: 0, total: 4 });
    expect(count(`GET /periodic-tasks/${TASK}/checklist-items`)).toBe(0);
  });

  it('M5 - Xoá (BE trả checklistProgress): 0 GET list; nhãn ghi đúng số BE', async () => {
    extra = { checklistProgress: { done: 1, total: 3 } };
    const view = await ready();

    await act(async () => {
      await view.result.current.remove.mutateAsync({ taskId: TASK, itemId: ITEM });
    });
    await settle();

    expect(count('GET /periodic-tasks')).toBe(0);
    expect(listRow(TASK)?.checklistProgress).toEqual({ done: 1, total: 3 });
  });

  it('M6 - Xoá nhưng BE CŨ không trả tiến độ -> FALLBACK refetch list', async () => {
    const view = await ready();

    await act(async () => {
      await view.result.current.remove.mutateAsync({ taskId: TASK, itemId: ITEM });
    });
    await settle();

    expect(count('GET /periodic-tasks')).toBe(1);
  });

  it('M7 - Di chuyển: 0 GET list, nhãn không đổi, trang checklist refetch', async () => {
    const view = await ready();

    await act(async () => {
      await view.result.current.move.mutateAsync({ taskId: TASK, itemId: ITEM, direction: 'up' });
    });
    await settle();

    expect(snapshot()).toEqual({
      [`PATCH /periodic-tasks/${TASK}/checklist-items/${ITEM}/move`]: 1,
      [`GET /periodic-tasks/${TASK}/checklist-items`]: 1,
    });
    expect(listRow(TASK)?.checklistProgress).toEqual({ done: 0, total: 4 });
  });
});
