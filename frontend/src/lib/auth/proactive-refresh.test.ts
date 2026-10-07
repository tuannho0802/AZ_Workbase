import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeJwt } from './__test-helpers__/makeJwt';

const state = { accessToken: null as string | null, refreshToken: 'r-old' as string | null };
vi.mock('../stores/auth.store', () => ({ useAuthStore: { getState: () => state } }));

const refreshShared = vi.fn();
vi.mock('./shared-refresh', () => ({ refreshAccessTokenShared: (...a: unknown[]) => refreshShared(...a) }));

import {
  ensureFreshAccessToken,
  PROACTIVE_REFRESH_COOLDOWN_MS,
  __resetProactiveRefreshForTests,
} from './proactive-refresh';

const URL = 'https://api.example/api/auth/refresh';
const NOW = 1_800_000_000_000;
const expired = () => makeJwt(NOW / 1000 - 5);
const fresh = () => makeJwt(NOW / 1000 + 3600);

describe('ensureFreshAccessToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetProactiveRefreshForTests();
    state.accessToken = expired();
    state.refreshToken = 'r-old';
    refreshShared.mockImplementation(async () => {
      state.accessToken = fresh();
      return state.accessToken;
    });
  });

  it('token còn hạn -> KHÔNG gọi refresh', async () => {
    state.accessToken = fresh();
    expect(await ensureFreshAccessToken(URL, NOW)).toBe('fresh');
    expect(refreshShared).not.toHaveBeenCalled();
  });

  it('không có token / không có refresh token -> bỏ qua, không gọi refresh', async () => {
    state.accessToken = null;
    expect(await ensureFreshAccessToken(URL, NOW)).toBe('skipped');
    state.accessToken = expired();
    state.refreshToken = null;
    expect(await ensureFreshAccessToken(URL, NOW)).toBe('skipped');
    expect(refreshShared).not.toHaveBeenCalled();
  });

  it('token hết hạn + 8 lời gọi song song -> ĐÚNG 1 lần refresh, truyền token cũ làm failedAccessToken', async () => {
    const old = state.accessToken;
    const results = await Promise.all(Array.from({ length: 8 }, () => ensureFreshAccessToken(URL, NOW)));
    expect(refreshShared).toHaveBeenCalledTimes(1);
    expect(refreshShared).toHaveBeenCalledWith(URL, old);
    expect(results).toEqual(Array(8).fill('refreshed'));
  });

  it('COOLDOWN: đồng hồ client lệch (token mới vẫn "sắp hết hạn") -> KHÔNG refresh liên tục', async () => {
    refreshShared.mockImplementation(async () => {
      state.accessToken = expired(); // token mới vẫn bị coi hết hạn do lệch đồng hồ
      return state.accessToken;
    });
    expect(await ensureFreshAccessToken(URL, NOW)).toBe('refreshed');
    for (let i = 1; i <= 5; i++) {
      expect(await ensureFreshAccessToken(URL, NOW + i * 1000)).toBe('skipped');
    }
    expect(refreshShared).toHaveBeenCalledTimes(1);
    // hết cooldown mới cho thử lại
    expect(await ensureFreshAccessToken(URL, NOW + PROACTIVE_REFRESH_COOLDOWN_MS + 1)).toBe('refreshed');
    expect(refreshShared).toHaveBeenCalledTimes(2);
  });

  it('BE từ chối refresh (có response) -> auth-failed; lỗi mạng (không response) -> skipped', async () => {
    refreshShared.mockRejectedValueOnce(Object.assign(new Error('401'), { response: { status: 401 } }));
    expect(await ensureFreshAccessToken(URL, NOW)).toBe('auth-failed');
    refreshShared.mockRejectedValueOnce(new Error('Network Error'));
    expect(await ensureFreshAccessToken(URL, NOW + PROACTIVE_REFRESH_COOLDOWN_MS + 1)).toBe('skipped');
  });
});
