import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCountdown, useCountdown } from './useCountdown';

describe('formatCountdown', () => {
  it('định dạng mm:ss, không âm', () => {
    expect(formatCountdown(125)).toBe('02:05');
    expect(formatCountdown(300)).toBe('05:00');
    expect(formatCountdown(9)).toBe('00:09');
    expect(formatCountdown(-5)).toBe('00:00');
  });
});

describe('useCountdown', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('đếm ngược mỗi giây và gọi onExpire đúng 1 lần khi về 0', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useCountdown(3, onExpire));
    expect(result.current).toBe(3);

    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(2);

    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toBe(0);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('bắt đầu từ 0/undefined -> không đếm, không gọi onExpire', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useCountdown(undefined, onExpire));
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current).toBe(0);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('`seconds` đổi giá trị -> đếm lại từ giá trị mới', () => {
    const { result, rerender } = renderHook(({ s }) => useCountdown(s), { initialProps: { s: 10 } });
    act(() => { vi.advanceTimersByTime(4000); });
    expect(result.current).toBe(6);
    rerender({ s: 300 });
    expect(result.current).toBe(300);
  });
});
