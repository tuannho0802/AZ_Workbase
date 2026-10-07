/**
 * Đọc hạn (`exp`) của access token JWT phía client để refresh CHỦ ĐỘNG
 * (PLAN_CPU_OPTIMIZATION_ROUND2 - Mục 9A). KHÔNG xác thực chữ ký (việc của BE) - chỉ đọc payload.
 * Không cần thư viện; mọi lỗi (token lạ, thiếu `exp`) trả `null` để caller bỏ qua và gửi request như cũ.
 */
export function getJwtExpMs(token: string | null | undefined): number | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** true nếu token đã hết hạn hoặc còn ít hơn `skewMs` (mặc định 60 s). Không đọc được `exp` -> false. */
export function isAccessTokenExpiring(
  token: string | null | undefined,
  nowMs: number = Date.now(),
  skewMs = 60_000,
): boolean {
  const exp = getJwtExpMs(token);
  return exp !== null && exp - nowMs < skewMs;
}
