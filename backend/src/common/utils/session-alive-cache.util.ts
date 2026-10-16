import { registerCacheProbe } from './cache-probe-registry';
/**
 * Cache ngắn hạn (theo TỪNG instance serverless) tập `sid` (mã phiên) còn hiệu lực của mỗi user - PLAN P5.
 * `JwtStrategy.validate()` dùng nó để biết access token có `sid` đã bị thu hồi chưa mà KHÔNG thêm 1 query/request.
 *
 * - TTL 15s: đăng xuất cưỡng bức ở instance KHÁC có hiệu lực trong tối đa ~15s; cùng instance thì được xoá ngay qua
 *   `invalidateSessionIds()` (gọi mỗi khi UsersService ghi `hashed_refresh_token`).
 * - Chỉ dùng để CHO PHÉP (sid có trong tập cache). Sid KHÔNG có trong cache KHÔNG bị từ chối ngay: caller phải đọc lại
 *   DB (nguồn sự thật) - tránh 401 oan khi người dùng vừa đăng nhập ở instance khác trong lúc cache còn cũ.
 */
const TTL_MS = 15_000;
const MAX_ENTRIES = 500;

const store = new Map<number, { sids: Set<string>; expiresAt: number }>();
registerCacheProbe({ key: 'session_alive', label: 'Phiên còn hiệu lực (sid)', ttlSeconds: TTL_MS / 1000, size: () => store.size });

export function getCachedSessionIds(userId: number): Set<string> | undefined {
    const hit = store.get(userId);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
        store.delete(userId);
        return undefined;
    }
    return hit.sids;
}

export function setCachedSessionIds(userId: number, sids: Iterable<string>): void {
    if (store.size >= MAX_ENTRIES) store.clear();
    store.set(userId, { sids: new Set(sids), expiresAt: Date.now() + TTL_MS });
}

export function invalidateSessionIds(userId: number): void {
    store.delete(userId);
}

export function clearSessionIdCache(): void {
    store.clear();
}