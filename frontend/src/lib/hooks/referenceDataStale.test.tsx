import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const m = vi.hoisted(() => ({
  guideList: vi.fn(),
  roleColors: vi.fn(),
  customerStatuses: vi.fn(),
  taskStatuses: vi.fn(),
}));

vi.mock('../api/guides.api', () => ({
  guidesApi: {
    list: () => m.guideList(),
    getBySlug: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('../api/roles.api', () => ({
  rolesApi: {
    getAllRoleColors: () => m.roleColors(),
    getAllRoles: vi.fn().mockResolvedValue([]),
    getAllPermissions: vi.fn().mockResolvedValue([]),
    updateRole: vi.fn().mockResolvedValue({}),
    createRole: vi.fn().mockResolvedValue({}),
    deleteRole: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('../api/customer-statuses.api', () => ({
  customerStatusesApi: {
    getAll: () => m.customerStatuses(),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('../api/periodic-task-statuses.api', () => ({
  periodicTaskStatusesApi: {
    getAll: () => m.taskStatuses(),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue({}),
  },
}));

import { REFERENCE_DATA_STALE_MS } from '../query-stale';
import { useGuideList } from './useGuides';
import { useRoleColors } from './useRoleColorMap';
import { useUpdateRole } from './useRoles';
import { useCustomerStatuses, useUpdateCustomerStatus } from './useCustomerStatuses';
import { usePeriodicTaskStatuses, useUpdatePeriodicTaskStatus } from './usePeriodicTaskStatuses';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe('Plan CPU Mục 6A - dữ liệu tham chiếu: staleTime 5 phút + invalidate theo mutation', () => {
  beforeEach(() => {
    m.guideList.mockReset().mockResolvedValue([]);
    m.roleColors.mockReset().mockResolvedValue([]);
    m.customerStatuses.mockReset().mockResolvedValue([]);
    m.taskStatuses.mockReset().mockResolvedValue([]);
  });
  afterEach(() => vi.useRealTimers());

  it('hằng số = 5 phút', () => {
    expect(REFERENCE_DATA_STALE_MS).toBe(5 * 60 * 1000);
  });

  const cases = [
    ['roles/colors', () => m.roleColors, () => useRoleColors(), () => useUpdateRole(), null],
    ['customer-statuses', () => m.customerStatuses, () => useCustomerStatuses(), () => useUpdateCustomerStatus(), null],
    ['periodic-task-statuses', () => m.taskStatuses, () => usePeriodicTaskStatuses(), () => useUpdatePeriodicTaskStatus(), null],
  ] as const;

  for (const [name, getApi, useRead, useWrite, manual] of cases) {
    it(`${name}: mount lại trong 5 phút KHÔNG gọi API lại`, async () => {
      const { qc, wrapper } = setup();
      const first = renderHook(() => useRead(), { wrapper });
      await waitFor(() => expect(getApi()).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(first.result.current.isLoading).toBe(false));
      first.unmount();

      renderHook(() => useRead(), { wrapper }); // sang trang khác rồi quay lại
      await new Promise((r) => setTimeout(r, 20));
      expect(getApi()).toHaveBeenCalledTimes(1);
      expect(qc.getQueryCache().getAll()[0].isStale()).toBe(false);
    });

    it(`${name}: sau mutation -> dữ liệu bị đánh dấu cũ và tải lại`, async () => {
      const { wrapper } = setup();
      const read = renderHook(() => useRead(), { wrapper });
      await waitFor(() => expect(getApi()).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(read.result.current.isLoading).toBe(false));

      // roles/colors: useUpdateRole invalidate ['roles'] (tiền tố) -> phủ cả ['roles','colors'].
      const write = renderHook(() => useWrite(), { wrapper });
      await act(async () => {
        await (write.result.current as any).mutateAsync({ id: 1, data: {}, payload: {} });
      });
      await waitFor(() => expect(getApi()).toHaveBeenCalledTimes(2));
    });
  }

  it('guides (mục lục): mount lại trong 5 phút KHÔNG gọi API lại; invalidate [\'guides\'] -> tải lại', async () => {
    const { qc, wrapper } = setup();
    const a = renderHook(() => useGuideList(), { wrapper });
    await waitFor(() => expect(a.result.current.isLoading).toBe(false));
    a.unmount();
    renderHook(() => useGuideList(), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(m.guideList).toHaveBeenCalledTimes(1);

    await act(async () => { await qc.invalidateQueries({ queryKey: ['guides'] }); });
    await waitFor(() => expect(m.guideList).toHaveBeenCalledTimes(2));
  });

  it('roles/colors: useUpdateRole invalidate khoá ["roles"] (tiền tố của ["roles","colors"])', async () => {
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const write = renderHook(() => useUpdateRole(), { wrapper });
    await act(async () => {
      await (write.result.current as any).mutateAsync({ id: 1, data: {} });
    });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['roles'] }));
  });
});
