import { describe, it, expect, beforeEach } from 'vitest';
import { planToasts, readLastSeenVersion, writeLastSeenVersion, MAX_TOASTS_PER_POLL } from './toast-plan';
import type { NotificationItem } from '../types/notification.types';

const item = (id: number, sortAtMs: number) =>
  ({ id, sortAt: new Date(sortAtMs).toISOString() }) as NotificationItem;

describe('planToasts', () => {
  it('chỉ lấy thông báo MỚI hơn mốc đã thấy, mới nhất trước', () => {
    const plan = planToasts([item(1, 1000), item(2, 3000), item(3, 2000)], 1500);
    expect(plan.individual.map((n) => n.id)).toEqual([2, 3]);
    expect(plan.extraCount).toBe(0);
  });

  it(`tối đa ${MAX_TOASTS_PER_POLL} thông báo vẫn hiện riêng từng cái`, () => {
    const plan = planToasts([item(1, 2000), item(2, 3000), item(3, 4000)], 1000);
    expect(plan.individual).toHaveLength(3);
    expect(plan.extraCount).toBe(0);
  });

  it('nhiều hơn → 2 toast riêng + 1 toast gộp (tổng ≤ 3)', () => {
    const items = [1, 2, 3, 4, 5].map((i) => item(i, 1000 + i * 100));
    const plan = planToasts(items, 1000);
    expect(plan.individual.map((n) => n.id)).toEqual([5, 4]);
    expect(plan.extraCount).toBe(3);
    expect(plan.individual.length + (plan.extraCount > 0 ? 1 : 0)).toBeLessThanOrEqual(MAX_TOASTS_PER_POLL);
  });

  it('không có gì mới → rỗng', () => {
    expect(planToasts([item(1, 1000)], 1000)).toEqual({ individual: [], extraCount: 0 });
    expect(planToasts([], 0)).toEqual({ individual: [], extraCount: 0 });
  });
});

describe('lastSeenVersion (sessionStorage)', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('chưa có → null (lần poll đầu của phiên)', () => {
    expect(readLastSeenVersion(7)).toBeNull();
  });

  it('ghi rồi đọc lại; tách riêng theo user', () => {
    writeLastSeenVersion(7, 1234);
    expect(readLastSeenVersion(7)).toBe(1234);
    expect(readLastSeenVersion(8)).toBeNull();
  });

  it('chỉ tăng, không bao giờ hạ (xoá thông báo mới nhất không gây toast lại)', () => {
    writeLastSeenVersion(7, 5000);
    writeLastSeenVersion(7, 4000);
    expect(readLastSeenVersion(7)).toBe(5000);
    writeLastSeenVersion(7, 6000);
    expect(readLastSeenVersion(7)).toBe(6000);
  });

  it('giá trị rác trong storage → coi như chưa có', () => {
    window.sessionStorage.setItem('notif:lastSeenVersion:7', 'abc');
    expect(readLastSeenVersion(7)).toBeNull();
  });
});
