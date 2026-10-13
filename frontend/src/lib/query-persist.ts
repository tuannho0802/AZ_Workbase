import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { readRefCacheState } from './api/ref-cache-version';
import { REF_DATA_SAFETY_STALE_MS } from './query-stale';

/**
 * [Giảm Fluid Active CPU] Lưu cache React Query của các danh mục ÍT ĐỔI xuống localStorage để F5 / mở lại tab
 * không phải gọi lại BE (RAM mất khi F5 -> trước đây mỗi lần F5 là ~8 request, kể cả 304 vẫn tốn CPU).
 *
 * CHỈ lưu danh mục trong whitelist bên dưới. CỐ Ý KHÔNG lưu: customers, periodic-tasks, deposits... (đổi liên tục, nhiều người
 * cùng sửa, chứa SĐT/email khách -> không để dữ liệu cá nhân nằm lại ở localStorage, và hiển thị cũ sẽ gây hiểu nhầm).
 *
 * An toàn về độ mới (dữ liệu cũ bị bỏ chứ không bị dùng nhầm):
 *  - Gắn "dấu" (stamp) = trạng thái refSig/permSig/epoch/nonce đang lưu ở `az-ref-cache-state`. Khác dấu lúc nạp lại
 *    (có danh mục/quyền/epoch đổi từ lần lưu cuối) -> BỎ HẾT, tải mới.
 *  - Không lưu query đã bị invalidate hoặc đang tải (tránh lưu dữ liệu cũ kèm dấu mới).
 *  - Giữ nguyên `updatedAt` gốc: staleTime của từng hook vẫn tính từ lúc tải thật; quá MAX_AGE thì không nạp.
 *  - Khoá theo userId; xoá khi đăng xuất. Lỗi localStorage (đầy, private mode) đều bị nuốt.
 */
const STORAGE_KEY = 'az-rq-cache-v1';
const VERSION = 1;
export const PERSIST_MAX_AGE_MS = REF_DATA_SAFETY_STALE_MS;
export const PERSIST_MAX_BYTES = 400_000;
const SAVE_DELAY_MS = 2000;

const ROOT_WHITELIST: ReadonlySet<string> = new Set([
  'departments',
  'positions',
  'customer-statuses',
  'periodic-task-statuses',
  'leave-types',
  'media-sources',
  'my-permissions',
]);

/** Khoá được phép lưu: danh mục + quyền của tôi + hồ sơ của tôi. Không lưu nội dung guide (chỉ mục lục). */
export function isPersistableQueryKey(key: QueryKey): boolean {
  const [root, second] = key as unknown[];
  if (typeof root !== 'string') return false;
  if (ROOT_WHITELIST.has(root)) return true;
  if (root === 'roles') return second === 'colors';
  if (root === 'guides') return second === 'list';
  if (root === 'users') return second === 'me';
  return false;
}

function sortedEntries(o: Record<string, number>): [string, number][] {
  return Object.keys(o)
    .sort()
    .map((k) => [k, o[k]]);
}

/** Dấu độ mới: đổi khi bất kỳ danh mục/quyền/epoch/nonce nào đổi. Không gồm userId (khoá riêng). */
export function currentStamp(): string {
  const s = readRefCacheState();
  return JSON.stringify([sortedEntries(s.sig), s.epoch ?? null, s.nonce, sortedEntries(s.dn), s.permSig ?? null]);
}

interface PersistedEntry {
  k: QueryKey;
  d: unknown;
  u: number;
}
interface PersistedBlob {
  v: number;
  userId: number;
  stamp: string;
  entries: PersistedEntry[];
}

export function clearPersistedQueryCache(): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* bỏ qua */
  }
}

/** Nạp cache đã lưu vào QueryClient (gọi 1 lần lúc khởi tạo, trước khi render). Trả về số query đã nạp. */
export function hydratePersistedQueries(qc: QueryClient, userId: number | undefined, now: number = Date.now()): number {
  if (typeof window === 'undefined' || userId === undefined) return 0;
  let blob: PersistedBlob;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    blob = JSON.parse(raw) as PersistedBlob;
  } catch {
    clearPersistedQueryCache();
    return 0;
  }
  if (!blob || blob.v !== VERSION || blob.userId !== userId || blob.stamp !== currentStamp() || !Array.isArray(blob.entries)) {
    clearPersistedQueryCache();
    return 0;
  }
  let n = 0;
  for (const e of blob.entries) {
    if (!e || !Array.isArray(e.k) || !isPersistableQueryKey(e.k) || typeof e.u !== 'number') continue;
    if (now - e.u >= PERSIST_MAX_AGE_MS || e.u > now + 60_000) continue;
    if (qc.getQueryData(e.k) !== undefined) continue;
    qc.setQueryData(e.k, e.d, { updatedAt: e.u });
    n++;
  }
  return n;
}

/** Ghi các query đủ điều kiện xuống localStorage ngay. */
export function savePersistedQueries(qc: QueryClient, userId: number | undefined): void {
  if (typeof window === 'undefined') return;
  if (userId === undefined) {
    clearPersistedQueryCache();
    return;
  }
  const entries: PersistedEntry[] = qc
    .getQueryCache()
    .findAll({
      predicate: (q) =>
        isPersistableQueryKey(q.queryKey) &&
        q.state.status === 'success' &&
        q.state.data !== undefined &&
        !q.state.isInvalidated &&
        q.state.fetchStatus === 'idle',
    })
    .map((q) => ({ k: q.queryKey, d: q.state.data, u: q.state.dataUpdatedAt }));
  try {
    const json = JSON.stringify({ v: VERSION, userId, stamp: currentStamp(), entries } satisfies PersistedBlob);
    if (json.length > PERSIST_MAX_BYTES) return;
    window.localStorage.setItem(STORAGE_KEY, json);
  } catch {
    /* localStorage đầy/không dùng được: bỏ qua, rơi về cache RAM */
  }
}

/** Theo dõi cache và lưu (gộp, trễ 2s; ghi nốt khi ẩn/đóng tab). Trả về hàm huỷ. */
export function startQueryPersistence(qc: QueryClient, getUserId: () => number | undefined): () => void {
  if (typeof window === 'undefined') return () => undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    savePersistedQueries(qc, getUserId());
  };
  const unsubscribe = qc.getQueryCache().subscribe((event) => {
    if (!event.query || !isPersistableQueryKey(event.query.queryKey)) return;
    if (!timer) timer = setTimeout(flush, SAVE_DELAY_MS);
  });
  const onHide = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onHide);
  return () => {
    unsubscribe();
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', onHide);
    if (timer) clearTimeout(timer);
  };
}
