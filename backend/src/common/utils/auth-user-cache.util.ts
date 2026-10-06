/**
 * Cache ngắn hạn (theo TỪNG instance serverless) cho user mà JwtStrategy tra mỗi request.
 * Poll/badge/list chạy liên tục nên tra DB mỗi request tốn Active CPU + 1 lượt DB.
 *
 * - TTL ngắn (10s): đổi role/phòng ban/isActive/isRootAdmin có hiệu lực trong tối đa 10s trên
 *   instance KHÁC; cùng instance thì được xoá ngay qua `invalidateAuthUser()` (gọi ở UsersService).
 * - KHÔNG cache kết quả "không tìm thấy" (user bị xoá/chưa duyệt luôn được kiểm tra lại từ DB).
 */
const TTL_MS = 10_000;
const MAX_ENTRIES = 500;

const store = new Map<number, { user: unknown; expiresAt: number }>();

export function getCachedAuthUser<T>(id: number): T | undefined {
  const hit = store.get(id);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    store.delete(id);
    return undefined;
  }
  return hit.user as T;
}

export function setCachedAuthUser(id: number, user: unknown): void {
  if (store.size >= MAX_ENTRIES) store.clear();
  store.set(id, { user, expiresAt: Date.now() + TTL_MS });
}

export function invalidateAuthUser(id: number): void {
  store.delete(id);
}

export function clearAuthUserCache(): void {
  store.clear();
}
