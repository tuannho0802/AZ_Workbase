import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';

/**
 * Phát hiện NGƯỜI DÙNG ĐANG HOẠT ĐỘNG hay đã bỏ treo tab.
 *
 * Vì sao cần (giảm Active CPU trên Vercel): React Query chỉ dừng polling khi tab
 * ẨN (document.hidden). Tab còn HIỂN THỊ nhưng không ai dùng (cửa sổ bị che, màn
 * hình thứ hai, người dùng đi làm việc khác) vẫn poll đều. Mỗi lần poll chạy
 * JwtStrategy + guard + query phía BE, kể cả khi BE trả 304.
 *
 * Quy tắc: không có chuột/phím/cuộn/chạm trong IDLE_AFTER_MS (5 phút) → "không
 * hoạt động" → các hook poll trả `refetchInterval: false`. Có tương tác lại (hoặc
 * tab hiện lại / focus lại) → hoạt động trở lại và làm mới NGAY nếu dữ liệu đã cũ.
 *
 * Dùng 1 store module-level (không phải listener riêng cho từng hook) nên dù có
 * nhiều hook gọi cùng lúc, chỉ gắn 1 bộ listener DOM; gỡ khi không còn ai dùng.
 */
export const IDLE_AFTER_MS = 5 * 60_000;

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'wheel',
  'scroll',
  'touchstart',
  'pointerdown',
] as const;

const listeners = new Set<() => void>();
let attached = false;
let idle = false;
let lastActivityAt = Date.now();
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function clearTimer() {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

/** Hẹn kiểm tra đúng lúc có thể hết hạn (không tạo timer mới ở MỖI sự kiện chuột). */
function scheduleCheck() {
  clearTimer();
  const wait = Math.max(1000, lastActivityAt + IDLE_AFTER_MS - Date.now());
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (Date.now() - lastActivityAt >= IDLE_AFTER_MS) {
      if (!idle) {
        idle = true;
        emit();
      }
    } else {
      scheduleCheck();
    }
  }, wait);
}

function markActive() {
  lastActivityAt = Date.now();
  if (idle) {
    idle = false;
    scheduleCheck();
    emit();
  }
}

function onVisibility() {
  if (document.visibilityState === 'visible') markActive();
}

function attach() {
  if (attached || typeof window === 'undefined') return;
  attached = true;
  idle = false;
  lastActivityAt = Date.now();
  ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, markActive, { passive: true }));
  window.addEventListener('focus', markActive);
  document.addEventListener('visibilitychange', onVisibility);
  scheduleCheck();
}

function detach() {
  if (!attached || typeof window === 'undefined') return;
  attached = false;
  ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, markActive));
  window.removeEventListener('focus', markActive);
  document.removeEventListener('visibilitychange', onVisibility);
  clearTimer();
}

/** Đăng ký nhận thông báo khi trạng thái hoạt động đổi. Trả hàm huỷ đăng ký. */
export function subscribeUserActivity(listener: () => void): () => void {
  listeners.add(listener);
  attach();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) detach();
  };
}

/** true = đang hoạt động; false = đã bỏ treo quá IDLE_AFTER_MS. */
export function getUserActive(): boolean {
  return !idle;
}

export function useIsUserActive(): boolean {
  return useSyncExternalStore(subscribeUserActivity, getUserActive, () => true);
}

/**
 * Trả về giá trị cho `refetchInterval` của useQuery: `intervalMs` khi đang hoạt
 * động, `false` khi đã bỏ treo. Khi người dùng quay lại (idle → active) và query
 * đã CŨ (`stale`, tức quá staleTime) thì làm mới ngay; query còn mới thì không
 * gọi thêm (tránh spam khi người dùng lúc rảnh lúc bận).
 *
 * Đặt `staleTime` của query bằng `intervalMs` (hoặc nhỏ hơn) để "cũ" có nghĩa là
 * "đã lỡ ít nhất 1 chu kỳ poll".
 */
export function useActivityPolling(
  queryKey: QueryKey,
  intervalMs: number,
  enabled = true,
): number | false {
  const active = useIsUserActive();
  const queryClient = useQueryClient();
  const keyHash = JSON.stringify(queryKey);

  useEffect(() => {
    if (!enabled || !active) return;
    // `cancelRefetch: false` → nếu 2 hook cùng key (poll thông báo) cùng gọi thì gộp 1 request.
    void queryClient.refetchQueries(
      { queryKey, stale: true, type: 'active' },
      { cancelRefetch: false },
    );
    // Chỉ chạy khi chuyển idle → active (và lúc mount: query vừa fetch nên chưa stale → no-op).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, enabled, keyHash, queryClient]);

  return enabled && active ? intervalMs : false;
}
