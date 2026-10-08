/**
 * Khoá phiên bản cho cache HTTP (private, max-age=1800) của các danh mục ít đổi.
 * BE (CacheControlInterceptor chế độ privateVersioned) cho trình duyệt giữ bản trả về 30 phút; để dữ liệu đổi là
 * bỏ bản cũ NGAY, FE gắn `?v=` vào URL và `v` đổi khi:
 *   - refSig[domain] đổi (poll báo)      - epoch đổi (Reset hệ thống)
 *   - nonce cục bộ tăng (chính máy này vừa sửa danh mục -> không chờ poll)   - đổi user đăng nhập
 * Mốc cuối lưu localStorage để F5 dùng lại đúng khoá cũ (=> trúng cache, không gọi BE) mà không phải chờ poll.
 * ⚠️ Chỉ ghi ở đây: poll (refSig/epoch) + nonce. Mọi lỗi localStorage đều bị nuốt (private mode...), rơi về bộ nhớ.
 */
export interface RefCacheState {
  userId: number | undefined;
  sig: Record<string, number>;
  epoch: number | undefined;
  nonce: number;
}

const STORAGE_KEY = 'az-ref-cache-state';
let memory: RefCacheState = { userId: undefined, sig: {}, epoch: undefined, nonce: 0 };

export function readRefCacheState(): RefCacheState {
  try {
    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<RefCacheState>;
        memory = {
          userId: typeof p.userId === 'number' ? p.userId : undefined,
          sig: p.sig && typeof p.sig === 'object' ? p.sig : {},
          epoch: typeof p.epoch === 'number' ? p.epoch : undefined,
          nonce: typeof p.nonce === 'number' ? p.nonce : 0,
        };
      }
    }
  } catch {
    /* dùng bản trong bộ nhớ */
  }
  return memory;
}

export function writeRefCacheState(patch: Partial<RefCacheState>): RefCacheState {
  memory = { ...readRefCacheState(), ...patch };
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    /* bỏ qua */
  }
  return memory;
}

/** Chỉ dùng trong test. */
export function resetRefCacheState(): void {
  memory = { userId: undefined, sig: {}, epoch: undefined, nonce: 0 };
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* bỏ qua */
  }
}

/** GET (đường dẫn không query) -> domain refSig quyết định khoá. Khớp BE `refDataCache()`: departments, users/all, roles/colors, positions. */
export const CACHED_REF_GET_DOMAIN: Readonly<Record<string, string>> = {
  '/departments': 'departments',
  '/users/all': 'users',
  '/roles/colors': 'roles',
  '/positions': 'positions',
};

/** Mutation vào các tiền tố này đổi dữ liệu của danh mục cache ở trên (khớp REF_DATA_TABLE_DOMAINS ở BE) -> tăng nonce. */
const MUTATION_PREFIXES = ['/departments', '/positions', '/roles', '/permissions', '/users'];

export function refVersionFor(path: string, userId: number | undefined): string | undefined {
  const domain = CACHED_REF_GET_DOMAIN[path];
  if (!domain || userId === undefined) return undefined;
  const s = readRefCacheState();
  return [userId, s.epoch ?? 0, s.nonce, s.sig[domain] ?? 0].join('.');
}

/** Gọi sau mỗi mutation THÀNH CÔNG; trả true nếu đã tăng nonce. */
export function noteMutationForRefCache(method: string | undefined, path: string): boolean {
  if (!method || method.toLowerCase() === 'get') return false;
  if (!MUTATION_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`))) return false;
  writeRefCacheState({ nonce: readRefCacheState().nonce + 1 });
  return true;
}

export const pathOf = (url: string | undefined): string => (url ?? '').split('?')[0];
