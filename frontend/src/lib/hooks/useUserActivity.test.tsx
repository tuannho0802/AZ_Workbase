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
    // Ghim T4 14/10/2026 10:00 giờ VN (trong khung giờ poll) để test không phụ thuộc giờ/ngày chạy thật (T7/CN, sau 18:45...).
    vi.setSystemTime(new Date('2026-10-14T10:00:00+07:00'));
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

  describe('khung giờ poll (T2-T6 trước 18:45 giờ VN; T7/CN không poll)', () => {
    const touch = () =>
      act(() => {
        window.dispatchEvent(new Event('mousemove'));
      });

    it('đang hoạt động nhưng đang qua 18:45 khi mở tab → không poll, không refetch lúc mount', async () => {
      vi.setSystemTime(new Date('2026-10-14T19:00:00+07:00'));
      const refetchSpy = vi.spyOn(queryClient, 'refetchQueries');
      const { result } = renderHook(() => useActivityPolling(['poll'], 450_000), { wrapper });
      expect(result.current).toBe(false);
      expect(refetchSpy).not.toHaveBeenCalled();
    });

    it('T7 và CN: không poll dù người dùng đang thao tác', async () => {
      vi.setSystemTime(new Date('2026-10-17T10:00:00+07:00')); // T7
      const sat = renderHook(() => useActivityPolling(['poll'], 450_000), { wrapper });
      expect(sat.result.current).toBe(false);
      sat.unmount();

      vi.setSystemTime(new Date('2026-10-18T10:00:00+07:00')); // CN
      const sun = renderHook(() => useActivityPolling(['poll'], 450_000), { wrapper });
      expect(sun.result.current).toBe(false);
    });

    it('đang mở tab lúc 18:40: vẫn poll, tới 18:45 tự DỪNG (không cần render lại)', async () => {
      vi.setSystemTime(new Date('2026-10-14T18:40:00+07:00'));
      const { result } = renderHook(() => useActivityPolling(['poll'], 450_000), { wrapper });
      expect(result.current).toBe(450_000);

      await advance(4 * 60_000);
      touch(); // giữ trạng thái "đang hoạt động" để chỉ còn lý do khung giờ
      expect(result.current).toBe(450_000); // 18:44
      await advance(2 * 60_000); // 18:46 (còn <5 phút từ lần chạm chuột)
      expect(getUserActive()).toBe(true);
      expect(result.current).toBe(false);
    });

    it('T6 qua 18:45 rồi sang T2 00:00 thì mở lại', async () => {
      vi.setSystemTime(new Date('2026-10-16T18:44:00+07:00')); // T6
      const { result } = renderHook(() => useActivityPolling(['poll'], 450_000), { wrapper });
      expect(result.current).toBe(450_000);

      await advance(2 * 60_000);
      touch();
      expect(result.current).toBe(false); // 18:46 T6

      // Nhảy tới T2 19/10 00:00:30 VN (bỏ qua T7/CN) rồi để timer mốc chạy.
      const target = new Date('2026-10-19T00:00:30+07:00').getTime();
      await advance(target - Date.now());
      touch();
      expect(result.current).toBe(450_000);
    });
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
