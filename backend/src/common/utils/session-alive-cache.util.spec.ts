import { clearSessionIdCache, getCachedSessionIds, invalidateSessionIds, setCachedSessionIds } from './session-alive-cache.util';

describe('session-alive-cache.util', () => {
  beforeEach(() => {
    clearSessionIdCache();
    jest.useRealTimers();
  });

  it('set/get; invalidate xoá đúng user', () => {
    setCachedSessionIds(1, ['a', 'b']);
    setCachedSessionIds(2, ['c']);
    expect(getCachedSessionIds(1)?.has('b')).toBe(true);
    invalidateSessionIds(1);
    expect(getCachedSessionIds(1)).toBeUndefined();
    expect(getCachedSessionIds(2)?.has('c')).toBe(true);
  });

  it('hết hạn sau 15 giây', () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
    setCachedSessionIds(1, ['a']);
    jest.setSystemTime(1_000_000 + 14_000);
    expect(getCachedSessionIds(1)).toBeDefined();
    jest.setSystemTime(1_000_000 + 15_001);
    expect(getCachedSessionIds(1)).toBeUndefined();
  });
});
