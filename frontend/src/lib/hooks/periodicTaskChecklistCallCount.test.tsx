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
import {
  useTaskChecklistPage,
  useLinkedChildrenChecklistPage,
  useAddTaskChecklistItem,
  SECONDARY_INVALIDATE_DELAY_MS,
} from './usePeriodicTaskChecklistItems';
import { useTaskLinksAmong, useTaskChildren, useTaskParents, useTaskRollup } from './usePeriodicTaskLinks';
import { usePeriodicTaskPerformanceSummary } from './usePeriodicTaskPerformance';

const TASK = 128; // task đang mở modal checklist
const OTHER = 99; // task khác (vd Task CHA hiển thị tiến độ của TASK)

let calls: string[] = [];
const count = (key: string) => calls.filter((c) => c === key).length;
const snapshot = () => Object.fromEntries([...new Set(calls)].sort().map((k) => [k, count(k)]));

/** Tiến độ mà BE (mock) trả về trong response POST (item + Task con) - FE phải ghi NGUYÊN số này vào cache list. */
const BE_PROGRESS = { done: 1, total: 5 };
let postProgress: { done: number; total: number } | undefined = BE_PROGRESS;

function installFakeBackend() {
  calls = [];
  postProgress = BE_PROGRESS;
  axiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const path = String(config.url).split('?')[0];
    calls.push(`${String(config.method).toUpperCase()} ${path}`);
    let data: unknown = {};
    if (config.method === 'get') {
      // Danh sách có 2 dòng: TASK (nhãn cũ 0/4) và OTHER (nhãn 3/3 - KHÔNG được bị đụng tới).
      data = {
        data: [
          { id: TASK, checklistProgress: { done: 0, total: 4 } },
          { id: OTHER, checklistProgress: { done: 3, total: 3 } },
        ],
        items: [], edges: [], total: 2, page: 1, limit: 100, totalPages: 1,
      };
    }
    if (config.method === 'post') {
      data = { item: { id: 1, content: 'x' }, total: 1, done: 0, ...(postProgress ? { checklistProgress: postProgress } : {}) };
    }
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
  lastClient = queryClient;
  return view;
}
let lastClient: QueryClient;

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

/** [9B-2] Chờ qua cửa sổ gộp của các refetch PHỤ (detail, Task con của cha, performance...). */
async function waitSecondary() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, SECONDARY_INVALIDATE_DELAY_MS + 300));
  });
}

async function addItem(view: ReturnType<typeof setup>, content = 'việc mới', reopen?: boolean) {
  await act(async () => {
    await view.result.current.mutateAsync({ taskId: TASK, content, ...(reopen ? { reopen } : {}) });
  });
  await settle();
}

describe('Thêm checklist item - số lần gọi endpoint (hiện trạng)', () => {
  beforeEach(() => {
    installFakeBackend();
  });

  it('S1 - Agenda + modal checklist: 1 lần thêm = 1 POST + 0 GET list (9B-1; trước: 1) + 1 GET checklist-items', async () => {
    const view = setup(baseObservers);
    await waitFor(() => expect(count('GET /periodic-tasks')).toBe(1));
    await waitFor(() => expect(count(`GET /periodic-tasks/${TASK}/checklist-items`)).toBe(1));
    await settle();
    calls = []; // chỉ đếm phần PHÁT SINH do thao tác thêm

    await addItem(view);

    // [9B-1] TRƯỚC: 'GET /periodic-tasks': 1. SAU: 0 (nhãn ghi từ response POST).
    expect(snapshot()).toEqual({
      [`POST /periodic-tasks/${TASK}/checklist-items`]: 1,
      [`GET /periodic-tasks/${TASK}/checklist-items`]: 1,
    });
  });

  it('S2 - Task con của CHÍNH task + cấu trúc liên kết + rollup của chính task: KHÔNG refetch (đã tối ưu)', async () => {
    const view = setup(() => {
      baseObservers();
      useLinkedChildrenChecklistPage(TASK, 1, true); // Task con của chính TASK
      useTaskLinksAmong([TASK, OTHER]);
      useTaskChildren(TASK);
      useTaskParents(TASK);
      useTaskRollup(TASK); // [9B-0] rollup của CHÍNH task nằm trong danh sách bỏ qua -> KHÔNG refetch
    });
    await waitFor(() => expect(count('GET /periodic-tasks')).toBe(1));
    await settle();
    calls = [];

    await addItem(view);
    const s = snapshot();

    expect(s[`GET /periodic-tasks/${TASK}/linked-children-checklist`]).toBeUndefined(); // bỏ qua: đúng
    expect(Object.keys(s).filter((k) => /links-among|children$|parents$/.test(k))).toEqual([]); // bỏ qua: đúng
    expect(s['GET /periodic-tasks']).toBeUndefined(); // [9B-1] trước: 1
    // [9B-0] TRƯỚC: toBe(1) (refetch thừa). SAU: 0 - BE getRollup chỉ đếm trạng thái Task con.
    expect(s[`GET /periodic-tasks/${TASK}/rollup`]).toBeUndefined();
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
    expect(count(`GET /periodic-tasks/${OTHER}/linked-children-checklist`)).toBe(0); // [9B-2] bị gộp, chưa chạy ngay
    await waitSecondary();

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
    expect(count(`GET /periodic-tasks/${TASK}`)).toBe(0); // [9B-2] bị gộp
    await waitSecondary();

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
    await waitSecondary(); // [9B-2]
    const perf = Object.entries(snapshot()).filter(([k]) => k.includes('performance'));

    expect(perf.reduce((n, [, v]) => n + (v as number), 0)).toBe(1);
  });

  it('S6 - Modal checklist ĐÓNG (enabled=false): chỉ 1 POST, không GET nào (9B-1)', async () => {
    const view = setup(() => {
      usePeriodicTasks({ page: 1, limit: 100 });
      useTaskChecklistPage(TASK, 1, false, {});
    });
    await waitFor(() => expect(count('GET /periodic-tasks')).toBe(1));
    await settle();
    calls = [];

    await addItem(view);

    // [9B-1] TRƯỚC: thêm 'GET /periodic-tasks': 1. SAU: chỉ còn POST.
    expect(snapshot()).toEqual({ [`POST /periodic-tasks/${TASK}/checklist-items`]: 1 });
  });

  it('S7 - Thêm 5 mục LIÊN TIẾP = 5 POST + 0 GET list (9B-1; trước: 5) + 5 GET checklist-items', async () => {
    const view = setup(baseObservers);
    await waitFor(() => expect(count('GET /periodic-tasks')).toBe(1));
    await settle();
    calls = [];

    for (let i = 0; i < 5; i++) await addItem(view, `việc ${i}`);

    expect(snapshot()).toEqual({
      [`POST /periodic-tasks/${TASK}/checklist-items`]: 5,
      [`GET /periodic-tasks/${TASK}/checklist-items`]: 5, // [9B-1] 'GET /periodic-tasks' trước: 5, sau: 0
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
    // [9B-1] list không còn refetch sau POST (trước: ≤ 5).
    expect(count('GET /periodic-tasks')).toBe(0);
    // eslint-disable-next-line no-console
    console.info('[S8] 5 POST dồn dập ->', snapshot());
  });

  describe('9B-2 - gộp refetch PHỤ khi thêm liên tiếp', () => {
    it('S13 - 5 lần thêm liên tiếp với detail + Task con của cha + performance đang mở: trang checklist refetch NGAY mỗi lần (5), các query phụ chỉ 1 lần sau lần cuối', async () => {
      const view = setup(() => {
        baseObservers();
        usePeriodicTask(TASK);
        useLinkedChildrenChecklistPage(OTHER, 1, true);
        usePeriodicTaskPerformanceSummary({} as never);
      });
      await waitFor(() => expect(count(`GET /periodic-tasks/${TASK}`)).toBe(1));
      await settle();
      calls = [];

      for (let i = 0; i < 5; i++) await addItem(view, `việc ${i}`);

      // Trước khi hết cửa sổ gộp: item mới đã hiện (5 lần refetch trang checklist), query phụ CHƯA chạy.
      expect(count(`GET /periodic-tasks/${TASK}/checklist-items`)).toBe(5);
      expect(count(`GET /periodic-tasks/${TASK}`)).toBe(0);
      expect(count(`GET /periodic-tasks/${OTHER}/linked-children-checklist`)).toBe(0);

      await waitSecondary();

      // TRƯỚC 9B-2: mỗi query phụ 5 lần. SAU: 1 lần.
      expect(count(`GET /periodic-tasks/${TASK}`)).toBe(1);
      expect(count(`GET /periodic-tasks/${OTHER}/linked-children-checklist`)).toBe(1);
      const perf = Object.entries(snapshot()).filter(([k]) => k.includes('performance'));
      expect(perf.reduce((n, [, v]) => n + (v as number), 0)).toBe(1);
      expect(count('GET /periodic-tasks')).toBe(0); // 9B-1 vẫn giữ
      expect(count(`GET /periodic-tasks/${TASK}/checklist-items`)).toBe(5); // trang checklist KHÔNG bị gộp
    });

    it('S14 - Nhánh FALLBACK (reopen=true) KHÔNG bị gộp: refetch đầy đủ ngay như cũ', async () => {
      const view = setup(() => {
        baseObservers();
        usePeriodicTask(TASK);
      });
      await waitFor(() => expect(count(`GET /periodic-tasks/${TASK}`)).toBe(1));
      await settle();
      calls = [];

      await addItem(view, 'mở lại', true);

      expect(count('GET /periodic-tasks')).toBe(1);
      expect(count(`GET /periodic-tasks/${TASK}`)).toBe(1); // ngay, không đợi cửa sổ gộp
    });
  });

  describe('9B-1 - nhãn "X/Z" ghi từ response POST', () => {
    const listRow = (id: number) =>
      (lastClient.getQueryData<{ data: Array<{ id: number; checklistProgress: unknown }> }>([
        'periodic-tasks',
        { page: 1, limit: 100, dateFrom: '2026-10-05', dateTo: '2026-10-11' },
      ])?.data ?? []).find((r) => r.id === id);

    it('S9 - cache list nhận ĐÚNG số của BE cho task vừa thêm; dòng task khác KHÔNG đổi; list bị đánh dấu stale (tự làm tươi lần sau)', async () => {
      const view = setup(baseObservers);
      await waitFor(() => expect(count('GET /periodic-tasks')).toBe(1));
      await settle();
      calls = [];

      await addItem(view);

      expect(listRow(TASK)?.checklistProgress).toEqual(BE_PROGRESS);
      expect(listRow(OTHER)?.checklistProgress).toEqual({ done: 3, total: 3 });
      expect(count('GET /periodic-tasks')).toBe(0);
      const state = lastClient.getQueryState(['periodic-tasks', { page: 1, limit: 100, dateFrom: '2026-10-05', dateTo: '2026-10-11' }]);
      expect(state?.isInvalidated).toBe(true);
    });

    it('S10 - reopen=true (BE có thể đổi status/kỳ) -> FALLBACK refetch list đầy đủ như cũ (1 lần)', async () => {
      const view = setup(baseObservers);
      await waitFor(() => expect(count('GET /periodic-tasks')).toBe(1));
      await settle();
      calls = [];

      await addItem(view, 'mở lại', true);

      expect(count('GET /periodic-tasks')).toBe(1);
    });

    it('S11 - BE cũ chưa trả checklistProgress -> FALLBACK refetch list đầy đủ (không tự cộng trừ ở FE)', async () => {
      postProgress = undefined;
      const view = setup(baseObservers);
      await waitFor(() => expect(count('GET /periodic-tasks')).toBe(1));
      await settle();
      calls = [];

      await addItem(view);

      expect(count('GET /periodic-tasks')).toBe(1);
      expect(listRow(TASK)?.checklistProgress).toEqual({ done: 0, total: 4 }); // dữ liệu mock refetch, FE không tự đổi
    });

    it('S12 - Mở lại list SAU khi thêm (observer mới mount) -> refetch 1 lần để lấy số thật từ BE', async () => {
      const view = setup(baseObservers);
      await waitFor(() => expect(count('GET /periodic-tasks')).toBe(1));
      await settle();
      await addItem(view);
      calls = [];

      const remount = renderHook(() => usePeriodicTasks({ page: 1, limit: 100, dateFrom: '2026-10-05', dateTo: '2026-10-11' }), {
        wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={lastClient}>{children}</QueryClientProvider>,
      });
      await waitFor(() => expect(count('GET /periodic-tasks')).toBe(1));
      remount.unmount();
    });
  });
});
