import type { NotificationItem } from '../types/notification.types';

/** Tối đa 3 toast/lần (PLAN 7.2): nếu nhiều hơn → 2 toast riêng + 1 toast gộp. */
export const MAX_TOASTS_PER_POLL = 3;
const INDIVIDUAL_WHEN_OVERFLOW = MAX_TOASTS_PER_POLL - 1;

export interface ToastPlan {
  /** Thông báo hiện riêng từng cái (mới nhất trước) */
  individual: NotificationItem[];
  /** > 0 → thêm 1 toast gộp "và N thông báo mới khác" */
  extraCount: number;
}

/**
 * Từ danh sách chưa đọc vừa tải, chọn ra những cái THỰC SỰ mới (`sortAt` lớn
 * hơn `lastSeenVersion`) và quyết định hiện toast thế nào. Hàm thuần để test.
 */
export function planToasts(items: NotificationItem[], lastSeenVersion: number): ToastPlan {
  const fresh = items
    .filter((n) => new Date(n.sortAt).getTime() > lastSeenVersion)
    .sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime());

  if (fresh.length <= MAX_TOASTS_PER_POLL) return { individual: fresh, extraCount: 0 };
  return {
    individual: fresh.slice(0, INDIVIDUAL_WHEN_OVERFLOW),
    extraCount: fresh.length - INDIVIDUAL_WHEN_OVERFLOW,
  };
}

// ── lastSeenVersion (sessionStorage, theo từng user) ──
// Lần poll ĐẦU của phiên (chưa có giá trị) → KHÔNG toast, chỉ ghi nhớ mốc.
const keyOf = (userId: number | string | undefined) => `notif:lastSeenVersion:${userId ?? 'anon'}`;

export function readLastSeenVersion(userId: number | string | undefined): number | null {
  try {
    const raw = window.sessionStorage.getItem(keyOf(userId));
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Chỉ tăng, không bao giờ hạ: xoá thông báo mới nhất làm `version` giảm sẽ không gây toast lại. */
export function writeLastSeenVersion(userId: number | string | undefined, version: number): void {
  try {
    const current = readLastSeenVersion(userId);
    if (current !== null && current >= version) return;
    window.sessionStorage.setItem(keyOf(userId), String(version));
  } catch {
    // sessionStorage bị chặn (chế độ riêng tư...) → bỏ qua, chỉ mất tính năng chống toast lặp
  }
}
