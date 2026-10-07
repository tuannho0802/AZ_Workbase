/**
 * ĐẾM CHÍNH XÁC số request khi mở app với access token ĐÃ HẾT HẠN (kịch bản log prod 2026-10-07:
 * 8 request song song -> 8 × 401 -> refresh -> 8 request gửi lại). Dùng `axiosInstance` THẬT + adapter giả (không mạng).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { makeJwt } from './__test-helpers__/makeJwt';

const state = {
  accessToken: null as string | null,
  refreshToken: 'r-old' as string | null,
  logoutLocal: vi.fn(),
  setTokens: vi.fn((a: string, r: string) => {
    state.accessToken = a;
    state.refreshToken = r;
  }),
};
vi.mock('../stores/auth.store', () => ({
  useAuthStore: { getState: () => state, persist: { rehydrate: async () => {} } },
}));
vi.mock('@/components/common/AntdAppProvider', () => ({ showMessage: { error: vi.fn() } }));

const refreshPost = vi.fn();
vi.mock('axios', async (orig) => {
  const actual = await orig<typeof import('axios')>();
  return { ...actual, default: Object.assign(actual.default, { post: (...a: unknown[]) => refreshPost(...a) }) };
});

import axiosInstance from '../api/axios-instance';
import { __resetProactiveRefreshForTests } from './proactive-refresh';

const nowS = () => Math.floor(Date.now() / 1000);
const EXPIRED = () => makeJwt(nowS() - 30, { v: 'old' });
const FRESH = () => makeJwt(nowS() + 3600, { v: 'new' });

const ENDPOINTS = ['/departments', '/positions', '/sidebar/badges', '/roles/colors', '/notifications/poll', '/users/me', '/guides', '/roles/my-permissions'];

/** Adapter giả: ghi lại mọi request; token có `v:new` -> 200, ngược lại 401 (giống BE khi token hết hạn). */
function installFakeBackend() {
  const calls: { url: string; status: number }[] = [];
  axiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const auth = String(config.headers.Authorization ?? '');
    const ok = auth.length > 0 && JSON.parse(Buffer.from(auth.split('.')[1], 'base64').toString()).v === 'new';
    const status = ok ? 200 : 401;
    calls.push({ url: config.url as string, status });
    const res = { data: {}, status, statusText: '', headers: {}, config, request: {} } as AxiosResponse;
    if (status === 401) throw Object.assign(new Error('401'), { isAxiosError: true, config, response: res });
    return res;
  };
  return calls;
}

describe('mở app với access token hết hạn - đếm số request thật', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetProactiveRefreshForTests();
    state.accessToken = EXPIRED();
    state.refreshToken = 'r-old';
    vi.stubGlobal('location', { pathname: '/customers', href: '/customers' });
    refreshPost.mockResolvedValue({ data: { access_token: FRESH(), refresh_token: 'r-new' } });
  });

  it('SAU 9A: 8 request song song = ĐÚNG 8 request tới BE (0 × 401) + ĐÚNG 1 lần /auth/refresh', async () => {
    const calls = installFakeBackend();
    await Promise.all(ENDPOINTS.map((u) => axiosInstance.get(u)));
    expect(calls.length).toBe(8);
    expect(calls.filter((c) => c.status === 401).length).toBe(0);
    expect(refreshPost).toHaveBeenCalledTimes(1);
  });

  it('token còn hạn -> 8 request, KHÔNG refresh', async () => {
    state.accessToken = FRESH();
    const calls = installFakeBackend();
    await Promise.all(ENDPOINTS.map((u) => axiosInstance.get(u)));
    expect(calls.length).toBe(8);
    expect(refreshPost).not.toHaveBeenCalled();
  });

  it('lưới 401 VẪN CÒN (= hành vi TRƯỚC 9A): exp còn xa nhưng BE từ chối -> 8 × 401 + 1 refresh + 8 gửi lại = 16 request BE + 1 refresh', async () => {
    state.accessToken = makeJwt(nowS() + 3600, { v: 'old' }); // exp còn xa -> không refresh chủ động, BE vẫn trả 401
    const calls = installFakeBackend();
    await Promise.all(ENDPOINTS.map((u) => axiosInstance.get(u)));
    expect(refreshPost).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c.status === 401).length).toBe(8);
    expect(calls.filter((c) => c.status === 200).length).toBe(8);
    expect(calls.length).toBe(16);
  });

  it('refresh bị BE từ chối khi refresh chủ động -> đăng xuất NGAY, chỉ 1 lần /auth/refresh (không refresh lần 2)', async () => {
    refreshPost.mockRejectedValue(Object.assign(new Error('401'), { response: { status: 401 } }));
    const calls = installFakeBackend();
    const results = await Promise.allSettled(ENDPOINTS.map((u) => axiosInstance.get(u)));
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(refreshPost).toHaveBeenCalledTimes(1);
    expect(state.logoutLocal).toHaveBeenCalled();
    expect(calls.length).toBe(8); // vẫn gửi 8 request (BE trả 401) nhưng không gọi refresh thêm
  });
});
