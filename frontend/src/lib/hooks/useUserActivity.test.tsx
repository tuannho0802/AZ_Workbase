import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  IDLE_AFTER_MS,
  getUserActive,
  subscribeUserActivity,
  useActivityPolling,
  useIsUserActive,
} from './useUserActivity';

let queryClient: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe('useUserActivity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('đang hoạt động lúc mới mount; chuyển "không hoạt động" sau đúng 5 phút không tương tác', async () => {
    const { result } = renderHook(() => useIsUserActive(), { wrapper });
    expect(result.current).toBe(true);

    await advance(IDLE_AFTER_MS - 5_000);
    expect(result.current).toBe(true);

    await advance(10_000);
    expect(result.current).toBe(false);
  });

  it('có tương tác (chuột/phím) thì đếm lại từ đầu, không bị coi là bỏ treo', async () => {
    const { result } = renderHook(() => useIsUserActive(), { wrapper });

    await advance(IDLE_AFTER_MS - 10_000);
    act(() => {
      window.dispatchEvent(new Event('mousemove'));
    });
    await advance(IDLE_AFTER_MS - 10_000); // tổng đã quá 5 phút kể từ mount nhưng mới <5 phút từ lần chuột
    expect(result.current).toBe(true);

    await advance(30_000);
    expect(result.current).toBe(false);
  });

  it('đã bỏ treo + có tương tác lại → hoạt động trở lại', async () => {
    const { result } = renderHook(() => useIsUserActive(), { wrapper });
    await advance(IDLE_AFTER_MS + 1_000);
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('keydown'));
    });
    expect(result.current).toBe(true);
  });

  it('tab hiện lại (visibilitychange → visible) được tính là hoạt động', async () => {
    const { result } = renderHook(() => useIsUserActive(), { wrapper });
    await advance(IDLE_AFTER_MS + 1_000);
    expect(result.current).toBe(false);

    act(() => {
      document.dispatchEvent(new Event('visibilitychange')); // jsdom: visibilityState = 'visible'
    });
    expect(result.current).toBe(true);
  });

  it('useActivityPolling: trả intervalMs khi hoạt động, false khi bỏ treo hoặc disabled', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useActivityPolling(['k'], 120_000, enabled),
      { wrapper, initialProps: { enabled: true } },
    );
    expect(result.current).toBe(120_000);

    rerender({ enabled: false });
    expect(result.current).toBe(false);
    rerender({ enabled: true });
    expect(result.current).toBe(120_000);

    await advance(IDLE_AFTER_MS + 1_000);
    expect(result.current).toBe(false);
  });

  it('quay lại sau khi bỏ treo: gọi refetchQueries chỉ cho query stale (gộp request trùng); đang bỏ treo thì không gọi', async () => {
    const refetchSpy = vi.spyOn(queryClient, 'refetchQueries');
    const { result } = renderHook(() => useActivityPolling(['poll'], 120_000), { wrapper });
    // Lúc mount gọi refetchQueries với stale:true, cancelRefetch:false (gộp request trùng).
    expect(refetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['poll'], stale: true, type: 'active' }),
      { cancelRefetch: false },
    );

    refetchSpy.mockClear();
    await advance(IDLE_AFTER_MS + 1_000);
    expect(result.current).toBe(false);
    expect(refetchSpy).not.toHaveBeenCalled(); // đang bỏ treo → không gọi gì

    act(() => {
      window.dispatchEvent(new Event('mousedown'));
    });
    expect(result.current).toBe(120_000);
    expect(refetchSpy).toHaveBeenCalledTimes(1); // chuyển idle → active → thử làm mới (chỉ query stale)
  });

  it('subscribeUserActivity: gắn listener DOM khi có người đăng ký, gỡ sạch khi không còn ai', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const listener = vi.fn();
    const unsub = subscribeUserActivity(listener);
    expect(addSpy.mock.calls.some(([e]) => e === 'mousemove')).toBe(true);
    expect(getUserActive()).toBe(true);

    await advance(IDLE_AFTER_MS + 1_000);
    expect(getUserActive()).toBe(false);
    expect(listener).toHaveBeenCalled();

    unsub();
    expect(removeSpy.mock.calls.some(([e]) => e === 'mousemove')).toBe(true);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
