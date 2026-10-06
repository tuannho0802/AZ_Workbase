import axios from 'axios';
import { useAuthStore } from '../stores/auth.store';

/**
 * Làm mới access token SAO CHO CHỈ 1 TAB thật sự gọi `/auth/refresh` (PLAN_CPU_OPTIMIZATION_ROUND2 - Mục 2A).
 *
 * Vấn đề: token nằm ở localStorage nhưng mỗi tab giữ BẢN SAO riêng trong RAM (zustand `persist` không tự đồng bộ
 * giữa các tab). Tab A refresh xong (BE xoay refresh token) -> tab B vẫn cầm refresh token CŨ trong RAM -> tab B
 * refresh bằng token đã bị thay -> BE coi là "tái sử dụng token" và thu hồi cả phiên.
 *
 * Cách làm: (1) Web Locks API khoá liên-tab (`navigator.locks`) để các tab refresh TUẦN TỰ; (2) trong khoá, đọc lại
 * localStorage - nếu access token đã KHÁC token vừa bị 401 thì tab khác đã refresh xong -> dùng luôn, KHÔNG gọi API.
 * Trình duyệt không có Web Locks (Safari < 15.4): bỏ khoá nhưng vẫn đọc lại localStorage (thu hẹp cửa sổ lỗi).
 */
const LOCK_NAME = 'az-auth-refresh';

interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? (navigator as { locks?: LockManagerLike }).locks : undefined;
  return locks?.request ? locks.request(LOCK_NAME, fn) : fn();
}

/** Lấy phần token từ header `Authorization: Bearer xxx`. */
export function bearerToken(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1] : null;
}

export async function refreshAccessTokenShared(refreshUrl: string, failedAccessToken: string | null): Promise<string> {
  return withCrossTabLock(async () => {
    try {
      await useAuthStore.persist.rehydrate(); // đọc token mới nhất mà tab khác có thể vừa ghi
    } catch {
      // localStorage lỗi: dùng state trong RAM như trước
    }

    const { accessToken, refreshToken } = useAuthStore.getState();
    if (!refreshToken) throw new Error('NO_REFRESH_TOKEN');

    // Tab khác đã refresh xong trong lúc ta chờ khoá -> dùng luôn token mới, KHÔNG gọi API.
    if (accessToken && failedAccessToken && accessToken !== failedAccessToken) return accessToken;

    const response = await axios.post(refreshUrl, { refreshToken }, { withCredentials: true });
    const token: string = response.data.access_token || response.data.accessToken;
    const newRefreshToken: string = response.data.refresh_token || response.data.refreshToken;

    // ⭐ Lưu CẢ HAI token (refresh token đã xoay) - ghi localStorage để tab khác đọc được.
    useAuthStore.getState().setTokens(token, newRefreshToken);
    return token;
  });
}
