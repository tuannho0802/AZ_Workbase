import {
  clearAuthUserCache,
  getCachedAuthUser,
  invalidateAuthUser,
  setCachedAuthUser,
} from './auth-user-cache.util';

describe('auth-user-cache', () => {
  beforeEach(() => {
    clearAuthUserCache();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('trả lại user đã cache trong TTL, hết 10s thì miss', () => {
    setCachedAuthUser(1, { id: 1 });
    expect(getCachedAuthUser(1)).toEqual({ id: 1 });
    jest.advanceTimersByTime(9_999);
    expect(getCachedAuthUser(1)).toEqual({ id: 1 });
    jest.advanceTimersByTime(2);
    expect(getCachedAuthUser(1)).toBeUndefined();
  });

  it('invalidateAuthUser xoá đúng user đó', () => {
    setCachedAuthUser(1, { id: 1 });
    setCachedAuthUser(2, { id: 2 });
    invalidateAuthUser(1);
    expect(getCachedAuthUser(1)).toBeUndefined();
    expect(getCachedAuthUser(2)).toEqual({ id: 2 });
  });
});
