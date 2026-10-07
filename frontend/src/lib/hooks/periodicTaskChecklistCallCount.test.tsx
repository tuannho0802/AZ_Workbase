/**
 * SPEC ĐO SỐ LẦN GỌI ENDPOINT khi THÊM mục checklist (PLAN_CPU_OPTIMIZATION_ROUND2 - Mục 9B).
 *
 * Dùng hook THẬT + API module THẬT + `axiosInstance` THẬT (adapter giả, không mạng) -> đếm CHÍNH XÁC request mà BE sẽ nhận,
 * theo "METHOD /đường-dẫn". Đây là test "đặc tả hiện trạng" (characterization): con số bên dưới là hành vi HIỆN TẠI;
 * khi làm 9B-1/9B-2 thì cập nhật đúng các con số này (đó chính là bằng chứng giảm).
 *
 * Bối cảnh log prod 2026-10-07: 24 POST checklist-items -> 24 GET /periodic-tasks + 25 GET .../checklist-items.
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
import { usePeriodicTasks, usePeriodicTask } from './usePeriodicTasks';
import { useTaskChecklistPage, useLinkedChildrenChecklistPage, useAddTaskChecklistItem } from './usePeriodicTaskChecklistItems';
import { useTaskLinksAmong, useTaskChildren, useTaskParents, useTaskRollup } from './usePeriodicTaskLinks';
import { usePeriodicTaskPerformanceSummary } from './usePeriodicTaskPerformance';

const TASK = 128; // task đang mở modal checklist
const OTHER = 99; // task khác (vd Task CHA hiển thị tiến độ của TASK)

let calls: string[] = [];
const count = (key: string) => calls.filter((c) => c === key).length;
const snapshot = () => Object.fromEntries([...new Set(calls)].sort().map((k) => [k, count(k)]));

function installFakeBackend() {
  calls = [];
  axiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const path = String(config.url).split('?')[0];
    calls.push(`${String(config.method).toUpperCase()} ${path}`);
    let data: unknown = {};
    if (config.method === 'get') {
      data = { data: [], items: [], edges: [], total: 0, page: 1, limit: 100, totalPages: 1 };
    }
    if (config.method === 'post') data = { item: { id: 1, content: 'x' }, total: 1, done: 0 };
    return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} } as AxiosResponse;
  };
}

function setup(mount: () => unknown) {
  const queryClient = new QueryClient({
    // Y HỆT AntdAppProvider.tsx (staleTime 30 s, tắt refetch khi focus); retry=false để test xác định.
    defaultOptions: { queries: { staleTime: 30000, gcTime: 300000, retry: false, refetchOnWindowFocus: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () => {
      const mutation = useAddTaskChecklistItem();
      mount();
      return mutation;
    },
    { wrapper },
  );
  return view;
}

/** Trang Công việc định kỳ (view agenda, limit 100) + modal checklist của TASK đang mở. */
function baseObservers() {
  usePeriodicTasks({ page: 1, limit: 100, dateFrom: '2026-10-05', dateTo: '2026-10-11' });
  useTaskChecklistPage(TASK, 1, true, {});
}

async function settle() {
  // chờ mọi refetch (invalidate) xong
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

async function addItem(view: ReturnType<typeof setup>, content = 'việc mới') {
  await act(async () => {
    await view.result.current.mutateAsync({ taskId: TASK, content });
  });
  await settle();
}

describe('Thêm checklist item - số lần gọi endpoint (hiện trạng)', () => {
  beforeEach(() => {
    installFakeBackend();
  });

  it('S1 - Agenda + modal checklist: 1 lần thêm = 1 POST + 1 GET list(limit 100) + 1 GET checklist-items', async () => {
    const view = setup(baseObservers);
    await waitFor(() => expect(count('GET /periodic-tasks')).toBe(1));
    await waitFor(() => expect(count(`GET /periodic-tasks/${TASK}/checklist-items`)).toBe(1));
    await settle();
    calls = []; // chỉ đếm phần PHÁT SINH do thao tác thêm

    await addItem(view);

    expect(snapshot()).toEqual({
      [`POST /periodic-tasks/${TASK}/checklist-items`]: 1,
      'GET /periodic-tasks': 1,
      [`GET /periodic-tasks/${TASK}/checklist-items`]: 1,
    });
  });

  it('S2 - thêm cả Task con liên kết của CHÍNH task (linked-children-page) + cấu trúc liên kết: KHÔNG refetch (đã tối ưu)', async () => {
    const view = setup(() => {
      baseObservers();
      useLinkedChildrenChecklistPage(TASK, 1, true); // Task con của chính TASK
      useTaskLinksAmong([TASK, OTHER]);
      useTaskChildren(TASK);
      useTaskParents(TASK);
      useTaskRollup(TASK); // rollup KHÔNG nằm trong danh sách bỏ qua -> sẽ refetch
    });
    await waitFor(() => expect(count('GET /periodic-tasks')).toBe(1));
    await settle();
    calls = [];

    await addItem(view);
    const s = snapshot();

    expect(s[`GET /periodic-tasks/${TASK}/linked-children-checklist`]).toBeUndefined(); // bỏ qua: đúng
    expect(Object.keys(s).filter((k) => /links-among|children$|parents$/.test(k))).toEqual([]); // bỏ qua: đúng
    expect(s['GET /periodic-tasks']).toBe(1);
    expect(s[`GET /periodic-tasks/${TASK}/rollup`]).toBe(1); // ⚠ vẫn refetch (không thuộc danh sách bỏ qua)
  });

  it('S3 - Task CHA đang mở trang Task con (linked-children-page của task KHÁC) -> vẫn refetch 1 lần (đúng thiết kế: hiển thị tiến độ)', async () => {
    const view = setup(() => {
      baseObservers();
      useLinkedChildrenChecklistPage(OTHER, 1, true);
    });
    await waitFor(() => expect(count(`GET /periodic-tasks/${OTHER}/linked-children-checklist`)).toBe(1));
    await settle();
    calls = [];

    await addItem(view);

    expect(count(`GET /periodic-tasks/${OTHER}/linked-children-checklist`)).toBe(1);
  });

  it('S4 - Có mở chi tiết task (GET /periodic-tasks/:id): refetch 1 lần', async () => {
    const view = setup(() => {
      baseObservers();
      usePeriodicTask(TASK);
    });
    await waitFor(() => expect(count(`GET /periodic-tasks/${TASK}`)).toBe(1));
    await settle();
    calls = [];

    await addItem(view);

    expect(count(`GET /periodic-tasks/${TASK}`)).toBe(1);
  });

  it('S5 - Trang Hiệu suất đang mở (query performance) -> luôn refetch thêm 1 lần', async () => {
    const view = setup(() => {
      baseObservers();
      usePeriodicTaskPerformanceSummary({} as never);
    });
    await settle();
    calls = [];

    await addItem(view);
    const perf = Object.entries(snapshot()).filter(([k]) => k.includes('performance'));

    expect(perf.reduce((n, [, v]) => n + (v as number), 0)).toBe(1);
  });

  it('S6 - Modal checklist ĐÓNG (enabled=false): không có GET checklist-items, chỉ list', async () => {
    const view = setup(() => {
      usePeriodicTasks({ page: 1, limit: 100 });
      useTaskChecklistPage(TASK, 1, false, {});
    });
    await waitFor(() => expect(count('GET /periodic-tasks')).toBe(1));
    await settle();
    calls = [];

    await addItem(view);

    expect(snapshot()).toEqual({
      [`POST /periodic-tasks/${TASK}/checklist-items`]: 1,
      'GET /periodic-tasks': 1,
    });
  });

  it('S7 - Thêm 5 mục LIÊN TIẾP (người dùng gõ nhanh) = 5 POST + 5 GET list + 5 GET checklist-items (CHƯA gộp)', async () => {
    const view = setup(baseObservers);
    await waitFor(() => expect(count('GET /periodic-tasks')).toBe(1));
    await settle();
    calls = [];

    for (let i = 0; i < 5; i++) await addItem(view, `việc ${i}`);

    expect(snapshot()).toEqual({
      [`POST /periodic-tasks/${TASK}/checklist-items`]: 5,
      'GET /periodic-tasks': 5,
      [`GET /periodic-tasks/${TASK}/checklist-items`]: 5,
    });
  });

  it('S8 - Thêm 5 mục DỒN DẬP (chưa chờ refetch xong): TanStack dedupe -> số GET ít hơn số POST', async () => {
    const view = setup(baseObservers);
    await waitFor(() => expect(count('GET /periodic-tasks')).toBe(1));
    await settle();
    calls = [];

    await act(async () => {
      await Promise.all(
        Array.from({ length: 5 }, (_, i) => view.result.current.mutateAsync({ taskId: TASK, content: `v${i}` })),
      );
    });
    await settle();

    expect(count(`POST /periodic-tasks/${TASK}/checklist-items`)).toBe(5);
    // Ghi nhận số thật để làm mốc cho 9B-2 (debounce): không được > 5.
    expect(count('GET /periodic-tasks')).toBeLessThanOrEqual(5);
    // eslint-disable-next-line no-console
    console.info('[S8] 5 POST dồn dập ->', snapshot());
  });
});
