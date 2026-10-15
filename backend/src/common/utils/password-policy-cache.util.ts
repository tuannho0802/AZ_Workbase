/**
 * Cache ngắn hạn (theo từng instance serverless) cho trạng thái "phải đổi mật khẩu" mà JwtStrategy tra mỗi request.
 * Giống auth-user-cache.util.ts: TTL ngắn, xoá ngay ở instance hiện tại khi đổi/reset (instance khác trễ tối đa TTL).
 * Giá trị `expired` được DB tính bằng NOW() lúc đọc; hết hạn "giữa chừng" trong TTL có độ trễ tối đa 15s - chấp nhận được.
 */
export interface PasswordPolicyState {
  /** must_change_password = 1 HOẶC password_expires_at <= NOW() */
  required: boolean;
  /** true nếu lý do là hết hạn (để FE hiện đúng thông điệp) */
  expired: boolean;
}

const TTL_MS = 15_000;
const MAX_ENTRIES = 500;
const store = new Map<number, { state: PasswordPolicyState; expiresAt: number }>();

export function getCachedPasswordPolicy(id: number): PasswordPolicyState | undefined {
  const hit = store.get(id);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    store.delete(id);
    return undefined;
  }
  return hit.state;
}

export function setCachedPasswordPolicy(id: number, state: PasswordPolicyState): void {
  if (store.size >= MAX_ENTRIES) store.clear();
  store.set(id, { state, expiresAt: Date.now() + TTL_MS });
}

export function invalidatePasswordPolicy(id: number): void {
  store.delete(id);
}

export function clearPasswordPolicyCache(): void {
  store.clear();
}
