import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { isPollWindowOpen, msUntilPollWindowChange } from '../poll-schedule';

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

/** setTimeout tối đa ~24,8 ngày; khoảng chờ lớn nhất ở đây (T6 19:00 -> T2 00:00) chỉ ~2,2 ngày nên an toàn. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * true = đang trong khung giờ poll (T2-T6 trước 18:45 giờ VN, xem `poll-schedule.ts`).
 * Tự đổi trạng thái đúng lúc qua mốc (hẹn giờ tới mốc kế tiếp) và kiểm tra lại khi tab hiện lại
 * (timer của tab nền có thể bị trình duyệt trì hoãn). Chỉ là timer phía trình duyệt, không gọi BE.
 */
function usePollWindowOpen(): boolean {
  const [open, setOpen] = useState(() => isPollWindowOpen());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sync = () => {
      setOpen(isPollWindowOpen());
      if (timer !== null) clearTimeout(timer);
      // +1s để chắc chắn đã QUA mốc (isPollWindowOpen so sánh theo phút).
      timer = setTimeout(sync, Math.min(msUntilPollWindowChange() + 1000, MAX_TIMEOUT_MS));
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    timer = setTimeout(sync, Math.min(msUntilPollWindowChange() + 1000, MAX_TIMEOUT_MS));
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return open;
}

/**
 * Trả về giá trị cho `refetchInterval` của useQuery: `intervalMs` khi đang hoạt
 * động, `false` khi đã bỏ treo HOẶC ngoài khung giờ poll (T7/CN, sau 18:45 T2-T6). Khi người dùng quay lại (idle → active) và query
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
  // [AGENT] NEW CODE: ngoài khung giờ (T7/CN, sau 18:45 T2-T6) tắt hẳn poll theo chu kỳ.
  const windowOpen = usePollWindowOpen();
  const queryClient = useQueryClient();
  const keyHash = JSON.stringify(queryKey);

  useEffect(() => {
    if (!enabled || !active || !windowOpen) return;
    // `cancelRefetch: false` → nếu 2 hook cùng key (poll thông báo) cùng gọi thì gộp 1 request.
    void queryClient.refetchQueries(
      { queryKey, stale: true, type: 'active' },
      { cancelRefetch: false },
    );
    // Chỉ chạy khi chuyển idle → active (và lúc mount: query vừa fetch nên chưa stale → no-op).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, enabled, windowOpen, keyHash, queryClient]);

  // [AGENT] OLD CODE (giữ để rollback): return enabled && active ? intervalMs : false;
  return enabled && active && windowOpen ? intervalMs : false;
}
