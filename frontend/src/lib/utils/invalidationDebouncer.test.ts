import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInvalidationDebouncer } from './invalidationDebouncer';

describe('createInvalidationDebouncer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('gộp N lần cùng khoá trong cửa sổ thành 1 lần chạy (hàm mới nhất), sau lần cuối', () => {
    const d = createInvalidationDebouncer(1500, 5000);
    const a = vi.fn(), b = vi.fn(), c = vi.fn();
    d.schedule(1, a);
    vi.advanceTimersByTime(1000);
    d.schedule(1, b);
    vi.advanceTimersByTime(1000);
    d.schedule(1, c);
    vi.advanceTimersByTime(1499);
    expect(a).not.toHaveBeenCalled();
    expect(c).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(c).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
    expect(d.pending()).toBe(0);
  });

  it('khoá khác nhau chạy độc lập', () => {
    const d = createInvalidationDebouncer(1500, 5000);
    const a = vi.fn(), b = vi.fn();
    d.schedule(1, a);
    d.schedule(2, b);
    vi.advanceTimersByTime(1500);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('thêm liên tục KHÔNG bị trì hoãn vô hạn: lần chạy đầu tiên muộn nhất đúng maxWait (5 s) kể từ lần đầu', () => {
    const d = createInvalidationDebouncer(1500, 5000);
    const start = Date.now();
    const ranAt: number[] = [];
    const fn = () => ranAt.push(Date.now() - start);
    for (let t = 0; t < 12000; t += 1000) { // mỗi 1 s một lần -> luôn "đang gõ", không bao giờ yên 1,5 s
      d.schedule(1, fn);
      vi.advanceTimersByTime(1000);
    }
    expect(ranAt.length).toBeGreaterThanOrEqual(2);
    expect(ranAt[0]).toBe(5000);
  });

  it('flush chạy ngay mọi việc đang chờ và dọn timer', () => {
    const d = createInvalidationDebouncer(1500, 5000);
    const fn = vi.fn();
    d.schedule(1, fn);
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(d.pending()).toBe(0);
  });
});
