import { useAuthStore } from '../stores/auth.store';
import { refreshAccessTokenShared } from './shared-refresh';
import { isAccessTokenExpiring } from './token-expiry';

/**
 * Refresh CHỦ ĐỘNG trước khi gửi request (PLAN_CPU_OPTIMIZATION_ROUND2 - Mục 9A).
 *
 * Log prod 2026-10-07: mở app khi access token đã hết hạn -> 8 request song song cùng bị 401, rồi refresh, rồi gửi lại cả 8
 * (≈ 16 invocation cho 1 lần mở app). Ở đây: token hết/sắp hết hạn -> các request song song CHỜ CHUNG 1 lần refresh
 * (dùng lại `refreshAccessTokenShared` = khoá liên-tab + đọc lại localStorage), rồi gửi 1 lần với token mới -> 0 lần 401.
 *
 * An toàn:
 *  - Lưới 401 trong axios-instance GIỮ NGUYÊN (đồng hồ máy lệch, token lạ, mạng lỗi...).
 *  - COOLDOWN: đồng hồ client chạy NHANH hơn server thì token vừa cấp vẫn "sắp hết hạn" -> không được refresh liên tục.
 *  - Refresh bị BE từ chối (có response) -> trả 'auth-failed' để caller đi thẳng nhánh đăng xuất, không refresh lần 2.
 *    Lỗi mạng (không có response) -> 'skipped': để nhánh 401 tự xử lý như trước.
 */
export type ProactiveRefreshResult = 'fresh' | 'refreshed' | 'auth-failed' | 'skipped';

export const PROACTIVE_REFRESH_COOLDOWN_MS = 30_000;

let inFlight: Promise<ProactiveRefreshResult> | null = null;
let lastAttemptAt = 0;

/** Chỉ dùng trong test. */
export function __resetProactiveRefreshForTests() {
  inFlight = null;
  lastAttemptAt = 0;
}

export function ensureFreshAccessToken(refreshUrl: string, nowMs: number = Date.now()): Promise<ProactiveRefreshResult> {
  if (inFlight) return inFlight; // request song song dùng chung 1 lần refresh

  const { accessToken, refreshToken } = useAuthStore.getState();
  if (!accessToken || !refreshToken) return Promise.resolve('skipped');
  if (!isAccessTokenExpiring(accessToken, nowMs)) return Promise.resolve('fresh');
  if (nowMs - lastAttemptAt < PROACTIVE_REFRESH_COOLDOWN_MS) return Promise.resolve('skipped');

  lastAttemptAt = nowMs;
  inFlight = refreshAccessTokenShared(refreshUrl, accessToken)
    .then((): ProactiveRefreshResult => 'refreshed')
    .catch((err: unknown): ProactiveRefreshResult => {
      const hasResponse = typeof err === 'object' && err !== null && 'response' in err && !!(err as { response?: unknown }).response;
      return hasResponse ? 'auth-failed' : 'skipped';
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
