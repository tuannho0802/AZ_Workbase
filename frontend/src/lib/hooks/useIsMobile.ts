'use client';

import { useSyncExternalStore } from 'react';

/**
 * Ngưỡng "mobile" của toàn FE (PLAN_MOBILE_SIDEBAR.md): `< 992px` = dưới breakpoint `lg` của AntD
 * (điện thoại + tablet dọc). Giữ 1 hằng số DUY NHẤT để Sidebar/Header/trang cùng đổi layout một lúc.
 */
export const MOBILE_MAX_WIDTH = 991.98;
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;

const subscribe = (onChange: () => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(MOBILE_MEDIA_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};

const getSnapshot = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(MOBILE_MEDIA_QUERY).matches;

// Server render luôn coi là desktop (không biết độ rộng) -> client đọc matchMedia thật ngay lúc hydrate.
const getServerSnapshot = () => false;

/**
 * `true` khi viewport < 992px. Cố ý KHÔNG dùng `Grid.useBreakpoint()` của AntD: hook đó trả `{}` ở lần
 * render đầu rồi mới cập nhật trong effect -> desktop sẽ bị nháy layout mobile 1 nhịp. `useSyncExternalStore`
 * đọc `matchMedia` đồng bộ nên đúng ngay từ lần render client đầu tiên và tự cập nhật khi đổi/xoay màn hình.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
