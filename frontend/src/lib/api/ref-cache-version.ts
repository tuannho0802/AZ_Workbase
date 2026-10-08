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
  /** Nonce RIÊNG từng domain (mutation vào guides/utms/storage/zk-device) - không làm đổi khoá của các danh mục khác. */
  dn: Record<string, number>;
  /** `permSig` của /notifications/poll (gắn vào `v` của domain phụ thuộc quyền người xem: guides, utms, attendance). */
  permSig: string | undefined;
}

declare module 'axios' {
  interface AxiosRequestConfig {
    /** true = KHÔNG gắn `?v=` -> BE trả `private, no-cache` (luôn hỏi lại). Dùng cho trang quản trị cần `inUseCount` mới nhất. */
    skipRefVersion?: boolean;
  }
}

const STORAGE_KEY = 'az-ref-cache-state';
let memory: RefCacheState = { userId: undefined, sig: {}, epoch: undefined, nonce: 0, dn: {}, permSig: undefined };

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
          dn: p.dn && typeof p.dn === 'object' ? p.dn : {},
          permSig: typeof p.permSig === 'string' ? p.permSig : undefined,
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
  memory = { userId: undefined, sig: {}, epoch: undefined, nonce: 0, dn: {}, permSig: undefined };
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* bỏ qua */
  }
}

/** GET (đường dẫn không query) -> domain refSig quyết định khoá. Khớp BE `refDataCache()` (xem các controller có `@UseInterceptors(refDataCache())`). */
export const CACHED_REF_GET_DOMAIN: Readonly<Record<string, string>> = {
  '/departments': 'departments',
  '/users/all': 'users',
  '/roles/colors': 'roles',
  '/positions': 'positions',
  // [AGENT] NEW: danh mục dropdown. Trang quản trị cần `inUseCount` (đếm từ bảng khác) gọi với `skipRefVersion` để luôn lấy số mới.
  '/customer-statuses': 'customer_statuses',
  '/periodic-task-statuses': 'periodic_task_statuses',
  '/leave-types': 'leave_types',
  '/media-sources': 'media_sources',
  '/link-categories': 'link_categories',
  '/link-groups': 'link_groups',
  // [AGENT] NEW: dữ liệu theo quyền người xem (v kèm permSig) hoặc có nguồn đổi riêng.
  '/guides': 'guides',
  '/utms': 'utms',
  '/utms/scoped': 'utms',
  '/utms/managed-by-me': 'utms',
  '/storage/usage': 'storage',
  '/storage/media': 'storage',
  '/zk-device/attendance-logs': 'attendance',
  '/zk-device/attendance-summary': 'attendance',
};

/** Tiền tố mutation -> domain có nonce RIÊNG (chỉ đổi khoá của đúng domain đó, không kéo theo danh mục khác). */
const DOMAIN_MUTATION_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ['/guides', 'guides'],
  ['/utms', 'utms'],
  ['/storage', 'storage'],
  ['/zk-device', 'attendance'],
];

/** Mutation vào các tiền tố này đổi dữ liệu của danh mục cache ở trên (khớp REF_DATA_TABLE_DOMAINS ở BE) -> tăng nonce. */
const MUTATION_PREFIXES = [
  '/departments',
  '/positions',
  '/roles',
  '/permissions',
  '/users',
  '/customer-statuses',
  '/periodic-task-statuses',
  '/leave-types',
  '/media-sources',
  '/link-categories',
  '/link-groups',
];

/**
 * Domain mà KẾT QUẢ còn phụ thuộc quyền/role/phòng ban/vị trí của người xem (BE lọc theo user) -> `v` kèm `permSig`,
 * quyền đổi là khoá đổi. Các domain còn lại dùng chung cho mọi người nên chỉ cần userId để không lẫn giữa các tài khoản.
 */
export const PERM_DEPENDENT_DOMAINS: ReadonlySet<string> = new Set(['guides', 'utms', 'attendance']);

/** Đường dẫn GET (không query) -> domain refSig. `/guides/:slug` (nội dung 1 guide) cùng domain `guides`; `/guides/manage/*` KHÔNG cache. */
export function domainForPath(path: string): string | undefined {
  const exact = CACHED_REF_GET_DOMAIN[path];
  if (exact) return exact;
  const m = /^\/guides\/([^/]+)$/.exec(path);
  if (m && m[1] !== 'manage') return 'guides';
  return undefined;
}

export function refVersionFor(path: string, userId: number | undefined): string | undefined {
  const domain = domainForPath(path);
  if (!domain || userId === undefined) return undefined;
  const s = readRefCacheState();
  const parts: (string | number)[] = [userId, s.epoch ?? 0, s.nonce, s.sig[domain] ?? 0];
  if (s.dn[domain]) parts.push(`n${s.dn[domain]}`);
  if (PERM_DEPENDENT_DOMAINS.has(domain)) {
    // permSig của user KHÁC (máy dùng chung) không được dùng - coi như chưa biết.
    // Chưa biết permSig của ĐÚNG user (lần đầu, trước poll đầu tiên) -> KHÔNG gắn `v` (BE trả no-cache như cũ) thay vì cache
    // dưới khoá thiếu quyền.
    const perm = s.userId === userId ? s.permSig : undefined;
    if (!perm) return undefined;
    parts.push(`p${perm.replace(/[^A-Za-z0-9]/g, '-')}`);
  }
  return parts.join('.');
}

/** Đổi khoá cache của 1 domain NGAY (vd nút "Làm mới" thủ công phải bỏ qua bản trong HTTP cache). */
export function bumpDomainNonce(domain: string): void {
  const dn = { ...readRefCacheState().dn };
  dn[domain] = (dn[domain] ?? 0) + 1;
  writeRefCacheState({ dn });
}

/** Gọi sau mỗi mutation THÀNH CÔNG; trả true nếu đã tăng nonce. */
export function noteMutationForRefCache(method: string | undefined, path: string): boolean {
  if (!method || method.toLowerCase() === 'get') return false;
  const own = DOMAIN_MUTATION_PREFIXES.find(([p]) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));
  if (own) {
    bumpDomainNonce(own[1]);
    return true;
  }
  if (!MUTATION_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`))) return false;
  writeRefCacheState({ nonce: readRefCacheState().nonce + 1 });
  return true;
}

export const pathOf = (url: string | undefined): string => (url ?? '').split('?')[0];
