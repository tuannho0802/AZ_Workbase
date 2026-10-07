/**
 * SPEC 9C (PLAN_CPU_OPTIMIZATION_ROUND2): `GET /users/all` phải dùng CHUNG cache ['users-for-select'].
 * Đếm request THẬT tới BE qua axiosInstance thật (adapter giả).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { InternalAxiosRequestConfig, AxiosResponse } from 'axios';

vi.mock('../stores/auth.store', () => ({
  useAuthStore: { getState: () => ({ accessToken: null, refreshToken: null, logoutLocal: vi.fn() }), persist: { rehydrate: async () => {} } },
}));
vi.mock('@/components/common/AntdAppProvider', () => ({ showMessage: { error: vi.fn() } }));

import axiosInstance from '../api/axios-instance';
import { usersApi } from '../api/users.api';
import { fetchUsersForSelect, invalidateUserLists, USERS_FOR_SELECT_KEY, USERS_FOR_SELECT_STALE_MS } from './useUsers';

let usersAllCalls = 0;
beforeEach(() => {
  usersAllCalls = 0;
  axiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    if (String(config.url).split('?')[0] === '/users/all') usersAllCalls++;
    return { data: [{ id: 1, name: 'A' }], status: 200, statusText: 'OK', headers: {}, config };
  };
});

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30000 } } });
const wrap = (qc: QueryClient) => ({ children }: { children: React.ReactNode }) =>
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

describe('9C - /users/all dùng chung cache', () => {
  it('fetchUsersForSelect gọi liên tiếp 2 lần (kể cả song song) -> chỉ 1 GET /users/all', async () => {
    const qc = makeClient();
    const [a, b] = await Promise.all([fetchUsersForSelect(qc), fetchUsersForSelect(qc)]);
    await fetchUsersForSelect(qc);
    expect(a).toEqual(b);
    expect(usersAllCalls).toBe(1);
  });

  it('chỗ gọi thẳng + useQuery cùng key (kiểu SalesUserSelect) -> vẫn chỉ 1 GET', async () => {
    const qc = makeClient();
    await fetchUsersForSelect(qc); // kiểu customers/page.tsx
    const { result } = renderHook(
      () => useQuery({ queryKey: USERS_FOR_SELECT_KEY, queryFn: () => usersApi.getAllForSelect(), staleTime: USERS_FOR_SELECT_STALE_MS }),
      { wrapper: wrap(qc) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(usersAllCalls).toBe(1);
  });

  it('sau mutation nhân viên (invalidateUserLists) -> lần dùng kế tiếp gọi lại, danh sách tươi', async () => {
    const qc = makeClient();
    await fetchUsersForSelect(qc);
    await invalidateUserLists(qc);
    await fetchUsersForSelect(qc);
    expect(usersAllCalls).toBe(2);
  });

  it('invalidate cả key users-list (useUsersList)', async () => {
    const qc = makeClient();
    qc.setQueryData(['users-list', undefined], [{ id: 1 }]);
    await invalidateUserLists(qc);
    expect(qc.getQueryState(['users-list', undefined])?.isInvalidated).toBe(true);
  });
});
