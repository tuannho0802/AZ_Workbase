import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  accessToken: 'access-old' as string | null,
  refreshToken: 'refresh-old' as string | null,
  setTokens: vi.fn((a: string, r: string) => {
    state.accessToken = a;
    state.refreshToken = r;
  }),
};
const rehydrate = vi.fn(async () => {});

vi.mock('../stores/auth.store', () => ({
  useAuthStore: {
    getState: () => state,
    persist: { rehydrate: () => rehydrate() },
  },
}));

const post = vi.fn();
vi.mock('axios', () => ({ default: { post: (...a: unknown[]) => post(...a) } }));

import { bearerToken, refreshAccessTokenShared } from './shared-refresh';

const URL = 'https://api.example/api/auth/refresh';

describe('refreshAccessTokenShared', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.accessToken = 'access-old';
    state.refreshToken = 'refresh-old';
    post.mockResolvedValue({ data: { access_token: 'access-new', refresh_token: 'refresh-new' } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('bearerToken tách token từ header Authorization', () => {
    expect(bearerToken('Bearer abc.def')).toBe('abc.def');
    expect(bearerToken('bearer x')).toBe('x');
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken('Basic zzz')).toBeNull();
  });

  it('đọc lại localStorage TRƯỚC khi quyết định gọi API', async () => {
    await refreshAccessTokenShared(URL, 'access-old');
    expect(rehydrate).toHaveBeenCalledTimes(1);
  });

  it('token chưa đổi -> gọi /auth/refresh với refresh token mới nhất và lưu CẢ HAI token', async () => {
    const token = await refreshAccessTokenShared(URL, 'access-old');
    expect(post).toHaveBeenCalledWith(URL, { refreshToken: 'refresh-old' }, { withCredentials: true });
    expect(state.setTokens).toHaveBeenCalledWith('access-new', 'refresh-new');
    expect(token).toBe('access-new');
  });

  it('tab khác đã refresh (access token trong localStorage khác token vừa 401) -> KHÔNG gọi API, dùng token mới', async () => {
    rehydrate.mockImplementationOnce(async () => {
      state.accessToken = 'access-from-other-tab';
      state.refreshToken = 'refresh-from-other-tab';
    });
    const token = await refreshAccessTokenShared(URL, 'access-old');
    expect(token).toBe('access-from-other-tab');
    expect(post).not.toHaveBeenCalled();
    expect(state.setTokens).not.toHaveBeenCalled();
  });

  it('không còn refresh token (tab khác đã đăng xuất) -> ném lỗi, không gọi API', async () => {
    rehydrate.mockImplementationOnce(async () => {
      state.refreshToken = null;
    });
    await expect(refreshAccessTokenShared(URL, 'access-old')).rejects.toThrow('NO_REFRESH_TOKEN');
    expect(post).not.toHaveBeenCalled();
  });

  it('rehydrate lỗi -> vẫn refresh bằng state trong RAM', async () => {
    rehydrate.mockRejectedValueOnce(new Error('storage'));
    await refreshAccessTokenShared(URL, 'access-old');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('có Web Locks: chạy trong khoá "az-auth-refresh"; 2 lần gọi chồng nhau chạy TUẦN TỰ', async () => {
    const order: string[] = [];
    let queue: Promise<unknown> = Promise.resolve();
    const request = vi.fn((name: string, cb: () => Promise<unknown>) => {
      const run = queue.then(async () => {
        order.push(`start:${name}`);
        const r = await cb();
        order.push('end');
        return r;
      });
      queue = run.catch(() => undefined);
      return run;
    });
    vi.stubGlobal('navigator', { locks: { request } });

    // Lần 1 refresh thật; lần 2 (tab khác) thấy token đã đổi nên không gọi API nữa.
    rehydrate.mockImplementationOnce(async () => {}).mockImplementationOnce(async () => {});
    const p1 = refreshAccessTokenShared(URL, 'access-old');
    const p2 = refreshAccessTokenShared(URL, 'access-old');
    const [t1, t2] = await Promise.all([p1, p2]);

    expect(request).toHaveBeenCalledWith('az-auth-refresh', expect.any(Function));
    expect(order).toEqual(['start:az-auth-refresh', 'end', 'start:az-auth-refresh', 'end']);
    expect(post).toHaveBeenCalledTimes(1); // chỉ 1 lần gọi API cho cả 2 tab
    expect(t1).toBe('access-new');
    expect(t2).toBe('access-new');
  });
});
